/**
 * Verifier (redemption agent's phone). Implements state machine SM1:
 * Idle -> CredentialRead -> (L2: ChallengeShown) -> AwaitingFaceCheck -> Accepted/Rejected -> RecordQueued.
 * Everything after the last sync runs with no network.
 */
import { useCallback, useEffect, useState } from "react";
import { api, Session } from "../lib/api";
import {
  b64urlDecode, challengeQr, codeKind, decodeQr, InvalidQRError, KeySet, newChallenge, packIds, parseTagged, Payload,
  todayIso, unpackIds, verifyChallengeResponse, verifyCredential, verifyRevocationList,
} from "../lib/qrw";
import { load, save } from "../lib/store";
import { Login } from "../components/Login";
import { QrCode } from "../components/QrCode";
import { Scanner } from "../components/Scanner";

const SOFT_DAYS = 7;   // FR-21: warn
const HARD_DAYS = 30;  // FR-21: refuse acceptances
const CHALLENGE_SECONDS = 60;
const DAY = 86_400_000;

interface Cache { keys: Record<string, string>; list: { version: number; ids: string[]; fetchedAt: number } | null }
interface StoredCache { keys: Record<string, string>; list: { version: number; packed: string; fetchedAt: number } | null }

// NFR-C3: the revocation list is kept compressed in the phone's storage.
function loadCache(): Cache {
  const s = load<StoredCache>("qrw.verifier.cache", { keys: {}, list: null });
  try {
    return { keys: s.keys || {}, list: s.list ? { version: s.list.version, fetchedAt: s.list.fetchedAt, ids: unpackIds(s.list.packed) } : null };
  } catch {
    return { keys: {}, list: null }; // unreadable cache: fail securely, force a fresh sync
  }
}
function saveCache(c: Cache): void {
  save("qrw.verifier.cache", { keys: c.keys, list: c.list ? { version: c.list.version, fetchedAt: c.list.fetchedAt, packed: packIds(c.list.ids) } : null });
}
interface QueuedRecord { record_id: string; credential_id: string; result: "accepted" | "rejected"; level: string | null; reason: string | null; verified_at: string }

type Step =
  | { s: "idle" }
  | { s: "challenge"; payload: Payload; nonce: string; startedAt: number }
  | { s: "face"; payload: Payload }
  | { s: "done"; accepted: boolean; payload: Payload | null; reason: string; level: string | null };

const REASON_TEXT: Record<string, string> = {
  BAD_SIGNATURE: "Signature does not match: the code was altered or forged.",
  UNKNOWN_ISSUER: "Issued by an unknown authority.",
  EXPIRED: "Credential has expired.",
  NOT_YET_VALID: "Credential is not valid yet.",
  REVOKED: "Credential has been revoked.",
  MALFORMED: "Not a readable credential.",
  NOT_A_CODE: "Not a valid identity code: it is damaged, altered, or from another system.",
  WRONG_CODE_BINDING: "That is the wallet's binding code (for the enrolment officer). Ask the farmer to tap Present and enter the PIN.",
  WRONG_CODE_CHALLENGE: "That is a challenge code from a verifier, not a credential.",
  WRONG_CODE_RESPONSE: "That is a wallet answer. Scan the credential first.",
  HOLDER_FAILED: "The wallet could not prove it holds this credential (copy or replay).",
  TIMEOUT: "The challenge timed out.",
  FACE_MISMATCH: "The agent judged the person does not match.",
  LIST_TOO_OLD: `Revocation list older than ${HARD_DAYS} days. Sync before accepting anyone.`,
  NO_SYNC: "This phone has never synced. Sync once while online.",
};

export default function Verifier() {
  const [session, setSession] = useState<Session | null>(() => load("qrw.verifier.session", null));
  const [cache, setCache] = useState<Cache>(loadCache);
  const [queue, setQueue] = useState<QueuedRecord[]>(() => load("qrw.verifier.queue", []));
  const [online, setOnline] = useState(navigator.onLine);
  const [clockOffsetDays, setOffset] = useState(0); // demo control to show FR-21 list-age rules
  const [step, setStep] = useState<Step>({ s: "idle" });
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);

  useEffect(() => save("qrw.verifier.session", session), [session]);
  useEffect(() => saveCache(cache), [cache]);
  useEffect(() => save("qrw.verifier.queue", queue), [queue]);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const now = Date.now() + clockOffsetDays * DAY;
  const listAgeDays = cache.list ? (now - cache.list.fetchedAt) / DAY : Infinity;
  const keySet: KeySet = Object.fromEntries(Object.entries(cache.keys).map(([k, v]) => [k, b64urlDecode(v)]));

  async function sync() {
    if (!session) return;
    setMsg(null);
    try {
      const k = await api("trust", "/keys");
      const keys: Record<string, string> = Object.fromEntries(k.keys.map((x: any) => [x.kid, x.public_key]));
      const ks: KeySet = Object.fromEntries(Object.entries(keys).map(([a, b]) => [a, b64urlDecode(b)]));
      let list: Cache["list"] = null;
      try {
        const r = await api("trust", "/revocations");
        const verified = verifyRevocationList(r.payload_b64, r.signature_b64, ks); // check the signature ourselves
        if (cache.list && verified.version < cache.list.version) throw new Error("Server offered an older list; refused.");
        list = { version: verified.version, ids: verified.revokedIds, fetchedAt: Date.now() };
      } catch (e) {
        if ((e as Error).message.includes("refused")) throw e;
        list = { version: 0, ids: [], fetchedAt: Date.now() };
      }
      setCache({ keys, list });
      setOffset(0);
      const uploaded = await upload(queue);
      setMsg({ kind: "ok", text: `Synced: ${Object.keys(keys).length} issuer key(s), revocation list v${list.version}. ${uploaded}` });
    } catch (e) {
      setMsg({ kind: "bad", text: (e as Error).message });
    }
  }

  async function upload(items: QueuedRecord[]): Promise<string> {
    if (!session || items.length === 0) return "";
    const r = await api("audit", "/records", { token: session.token, json: items });
    setQueue((q) => q.filter((x) => !items.some((i) => i.record_id === x.record_id)));
    return `Uploaded ${r.accepted} record(s) to the audit chain.`;
  }

  const finish = useCallback((accepted: boolean, payload: Payload | null, reason: string, level: string | null, credentialId: string) => {
    setStep({ s: "done", accepted, payload, reason, level });
    setQueue((q) => [...q, {
      record_id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(),
      credential_id: credentialId.slice(0, 40) || "unreadable", result: accepted ? "accepted" : "rejected",
      level, reason: accepted ? null : reason, verified_at: new Date().toISOString(),
    }]);
  }, []);

  const onCredential = useCallback((text: string) => {
    setMsg(null);
    if (!cache.list) return finish(false, null, "NO_SYNC", null, "unreadable");
    if (listAgeDays > HARD_DAYS) return finish(false, null, "LIST_TOO_OLD", null, "unreadable");
    const kind = codeKind(text);
    if (kind !== "credential" && kind !== "unknown") {
      setMsg({ kind: "warn", text: REASON_TEXT[`WRONG_CODE_${kind.toUpperCase()}`] });
      return; // a wrong-type code is a usage slip, not a verification attempt: nothing is recorded
    }
    let signed;
    try { signed = decodeQr(text); } catch (e) {
      return finish(false, null, e instanceof InvalidQRError ? "NOT_A_CODE" : "MALFORMED", null, "unreadable");
    }
    const r = verifyCredential(signed, keySet, new Set(cache.list.ids), todayIso(new Date(now)));
    if (!r.accepted || !r.payload) {
      let credId = "unreadable";
      try { credId = JSON.parse(new TextDecoder().decode(signed.payloadBytes)).id || credId; } catch { /* keep */ }
      return finish(false, null, r.reasons[0], null, String(credId));
    }
    if (r.payload.level === "L2") setStep({ s: "challenge", payload: r.payload, nonce: newChallenge(), startedAt: Date.now() });
    else setStep({ s: "face", payload: r.payload });
  }, [cache, keySet, listAgeDays, now, finish]);

  const onResponse = useCallback((text: string) => {
    if (step.s !== "challenge") return;
    const p = step.payload;
    if (Date.now() - step.startedAt > CHALLENGE_SECONDS * 1000) return finish(false, null, "TIMEOUT", "L2", p.credentialId);
    let ok = false;
    try {
      const [credId, sig] = parseTagged(text, "QRW1R");
      ok = credId === p.credentialId && verifyChallengeResponse(p.holderPublicKey!, step.nonce, p.credentialId, sig);
    } catch { ok = false; }
    if (!ok) return finish(false, null, "HOLDER_FAILED", "L2", p.credentialId);
    setStep({ s: "face", payload: p });
  }, [step, finish]);

  if (!session || session.expiresAt < Date.now()) {
    return <main className="page"><h1>Verifier</h1><Login role="Agent" hint="agent1" onLogin={setSession} /></main>;
  }

  return (
    <main className="page">
      <header className="bar">
        <div><h1>Verifier</h1><span className="sub">{session.username} · point {session.pointId}</span></div>
        <span className={`pill ${online ? "ok" : "bad"}`}>{online ? "Online" : "Offline"}</span>
      </header>

      <section className="card status">
        <div><span className="k">Revocation list</span><span className="v">{cache.list ? `v${cache.list.version}` : "never synced"}</span></div>
        <div><span className="k">List age</span>
          <span className={`v ${listAgeDays > HARD_DAYS ? "bad" : listAgeDays > SOFT_DAYS ? "warn" : ""}`}>
            {cache.list ? `${listAgeDays.toFixed(1)} days` : "—"}</span></div>
        <div><span className="k">Records waiting to upload</span><span className="v">{queue.length}</span></div>
        <div className="row">
          <button className="btn" onClick={sync}>Sync now</button>
          <select id="demo-clock" aria-label="Demo clock" value={clockOffsetDays} onChange={(e) => setOffset(Number(e.target.value))}>
            <option value={0}>Demo clock: today</option>
            <option value={8}>Demo clock: +8 days</option>
            <option value={31}>Demo clock: +31 days</option>
          </select>
        </div>
        {cache.list && listAgeDays > SOFT_DAYS && listAgeDays <= HARD_DAYS &&
          <p className="msg warn">List is {Math.floor(listAgeDays)} days old. Revoked credentials may still pass. Sync when you get signal.</p>}
        {msg && <p className={`msg ${msg.kind}`}>{msg.text}</p>}
      </section>

      {step.s === "idle" && <section className="card"><Scanner prompt="Scan the farmer's credential QR" onResult={onCredential} /></section>}

      {step.s === "challenge" && (
        <section className="card">
          <h2>Step 2 of 3 · Holder check</h2>
          <p>Ask the farmer to scan this code with the wallet, then scan the answer it shows.</p>
          <QrCode text={challengeQr(step.nonce, step.payload.credentialId)} size={240} label="Challenge (single use)" />
          <Scanner prompt="Scan the wallet's answer" onResult={onResponse} />
        </section>
      )}

      {step.s === "face" && (
        <section className="card">
          <h2>{step.payload.level === "L2" ? "Step 3 of 3" : "Step 2 of 2"} · Face check</h2>
          {step.payload.photo ? <img className="photo" alt="Signed photo from the credential" src={`data:image/jpeg;base64,${step.payload.photo.replace(/-/g, "+").replace(/_/g, "/")}`} />
            : <div className="photo none">No photo on this credential</div>}
          <dl className="facts">
            <dt>Name</dt><dd>{step.payload.name}</dd>
            <dt>Ward / LGA</dt><dd>{step.payload.ward}, {step.payload.lga}</dd>
            <dt>NIN</dt><dd>{step.payload.ninMasked}</dd>
            <dt>Level</dt><dd>{step.payload.level === "L2" ? "L2 · wallet with device key" : "L1 · paper wallet (visual check only)"}</dd>
          </dl>
          <p><strong>Is the person in front of you the person shown?</strong></p>
          <div className="row">
            <button className="btn okb" onClick={() => finish(true, step.payload, "", step.payload.level, step.payload.credentialId)}>Yes, same person</button>
            <button className="btn badb" onClick={() => finish(false, null, "FACE_MISMATCH", step.payload.level, step.payload.credentialId)}>No</button>
          </div>
        </section>
      )}

      {step.s === "done" && (
        <section className={`card verdict ${step.accepted ? "ok" : "bad"}`}>
          <div className="big">{step.accepted ? "✓ ACCEPTED" : "✗ REJECTED"}</div>
          <div className="ha">{step.accepted ? "An karɓa" : "An ƙi"}</div>
          {step.accepted && step.payload && <p>{step.payload.name} · {step.level === "L2" ? "wallet (L2)" : "paper wallet (L1)"}</p>}
          {!step.accepted && <p>{REASON_TEXT[step.reason] || step.reason}</p>}
          <p className="sub">Recorded. It will upload to the audit chain at the next sync.</p>
          <button className="btn" onClick={() => setStep({ s: "idle" })}>Next farmer</button>
        </section>
      )}

      <button className="btn ghost small" onClick={() => setSession(null)}>Sign out</button>
    </main>
  );
}
