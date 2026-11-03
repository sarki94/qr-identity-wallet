/**
 * Guided demo: the whole distribution day on one screen, for testing and for the oral defence.
 * Each step performs a REAL action: live calls to the five services and the same verification
 * library (src/lib/qrw.ts) the Verifier and Wallet screens use. Codes travel between the three
 * devices automatically instead of by camera or copy-paste.
 */
import { useRef, useState } from "react";
import { api, login, Session } from "../lib/api";
import {
  b64urlDecode, challengeQr, decodeQr, InvalidQRError, KeySet, newChallenge, newHolderKey, Payload,
  responseQr, signChallenge, todayIso, verifyChallengeResponse, verifyCredential, verifyRevocationList,
} from "../lib/qrw";
import { seal, Sealed, unseal } from "../lib/vault";
import { QrCode } from "../components/QrCode";

const PIN = "123456";
const NIN = "12345678901";

type Verdict = { ok: boolean; title: string; detail: string; warn?: string };
interface Shown { device: "officer" | "farmer" | "agent"; text: string; label: string }

interface World {
  officer: Session | null; agent: Session | null; agentOnline: boolean;
  wallet: { publicKey: string; sealed: Sealed; credentialQr: string | null } | null;
  farmerRecord: any; credentialQr: string | null; credentialId: string | null;
  keys: KeySet; list: { version: number; ids: string[] } | null;
  nonce: string | null; response: string | null; payload: Payload | null;
  queue: any[]; verdict: Verdict | null; shown: Shown[]; officerNote: string; agentNote: string; farmerNote: string;
  chain: any; records: any[];
}

const fresh = (): World => ({
  officer: null, agent: null, agentOnline: true, wallet: null, farmerRecord: null, credentialQr: null,
  credentialId: null, keys: {}, list: null, nonce: null, response: null, payload: null, queue: [], verdict: null,
  shown: [], officerNote: "", agentNote: "", farmerNote: "", chain: null, records: [],
});

interface Step { title: string; story: string; proves: string; run: (w: World) => Promise<Partial<World>> }

function record(w: World, ok: boolean, reason: string | null, level: string | null) {
  return [...w.queue, {
    record_id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    credential_id: w.credentialId || "unreadable", result: ok ? "accepted" : "rejected", level, reason,
    verified_at: new Date().toISOString(),
  }];
}

/** Full offline check of a credential + wallet answer, exactly as the Verifier does it. */
async function offlineCheck(w: World, qr: string, answer: (nonce: string, credId: string) => Promise<string>) {
  let signed;
  try { signed = decodeQr(qr); } catch (e) {
    return { ok: false, reason: e instanceof InvalidQRError ? "NOT_A_CODE" : "MALFORMED", detail: "The code is damaged or altered, so it cannot even be read." };
  }
  const r = verifyCredential(signed, w.keys, new Set(w.list?.ids || []), todayIso());
  if (!r.accepted || !r.payload) {
    const why: Record<string, string> = { BAD_SIGNATURE: "The issuer's signature does not match the content.", REVOKED: "This credential is on the revocation list.", UNKNOWN_ISSUER: "Unknown issuer.", EXPIRED: "Expired." };
    return { ok: false, reason: r.reasons[0], detail: why[r.reasons[0]] || r.reasons[0] };
  }
  const nonce = newChallenge();
  const resp = await answer(nonce, r.payload.credentialId);
  const held = verifyChallengeResponse(r.payload.holderPublicKey!, nonce, r.payload.credentialId, resp);
  if (!held) return { ok: false, reason: "HOLDER_FAILED", detail: "The answer was not signed for this fresh challenge: a copy or replay.", nonce };
  return { ok: true, reason: null, detail: `${r.payload.name}, ${r.payload.ward}, ${r.payload.lga}. Face matched by the agent.`, payload: r.payload, nonce, resp };
}

const STEPS: Step[] = [
  {
    title: "Farmer sets up the wallet", proves: "FR-04, FR-11 · NFR-S2",
    story: "Musa's phone creates its own key pair. The private key is locked with his PIN and never leaves the phone. The wallet shows a binding code that carries only the public key.",
    run: async (w) => {
      const k = newHolderKey();
      const wallet = { publicKey: k.publicKey, sealed: await seal(k.seed, PIN), credentialQr: null };
      k.seed.fill(0);
      return { wallet, farmerNote: `Profile "Musa Ibrahim" created, PIN ${PIN}.`, shown: [{ device: "farmer", text: `QRW1B:${k.publicKey}`, label: "Binding code (public key only)" }] };
    },
  },
  {
    title: "Officer looks Musa up at NIMC", proves: "FR-01, FR-27 · NFR-S4",
    story: "At the LGA office (online), the enrolment officer signs in and looks up Musa's NIN. The Issuer stores only a masked NIN and a keyed hash, never the full number.",
    run: async () => {
      const officer = await login("officer1", "Officer#2026!");
      const f = await api("issuer", "/enrolments", { token: officer.token, json: { nin: NIN } });
      return { officer, farmerRecord: f, officerNote: `NIMC confirmed: ${f.name}, ${f.ward}, ${f.lga}. NIN stored as ${f.nin_masked}.`, shown: [] };
    },
  },
  {
    title: "Officer scans the binding code and issues the credential", proves: "FR-03, FR-06 · D8 · STRIDE Tampering",
    story: "The officer scans Musa's binding code, and the Issuer signs a credential containing his details and his wallet's public key. If he already had one, it is revoked in the same transaction.",
    run: async (w) => {
      const c = await api("issuer", "/credentials", { token: w.officer!.token, json: { farmer_id: w.farmerRecord.id, level: "L2", holder_public_key: w.wallet!.publicKey } });
      return { credentialQr: c.qr_text, credentialId: c.id, officerNote: `Signed and issued ${c.id}, valid to ${c.expires_on}.`, shown: [{ device: "officer", text: c.qr_text, label: "Signed credential" }] };
    },
  },
  {
    title: "Musa's wallet saves the credential", proves: "FR-11, FR-13",
    story: "Musa scans the credential into his wallet. The wallet checks it is bound to its own key before saving it. From now on the wallet needs no network at all.",
    run: async (w) => {
      const body = JSON.parse(new TextDecoder().decode(decodeQr(w.credentialQr!).payloadBytes));
      if (body.hpk !== w.wallet!.publicKey) throw new Error("Credential is bound to a different wallet");
      return { wallet: { ...w.wallet!, credentialQr: w.credentialQr }, farmerNote: "Credential saved. Works offline from here.", shown: [{ device: "farmer", text: w.credentialQr!, label: "Musa's credential" }] };
    },
  },
  {
    title: "Agent syncs while there is signal", proves: "FR-14, FR-15 · STRIDE Denial of service",
    story: "At the distribution point the agent signs in and downloads the issuer's public key and the signed revocation list. The Verifier checks the list's signature itself.",
    run: async (w) => {
      const agent = await login("agent1", "Agent#2026!");
      const k = await api("trust", "/keys");
      const keys: KeySet = Object.fromEntries(k.keys.map((x: any) => [x.kid, b64urlDecode(x.public_key)]));
      let list = { version: 0, ids: [] as string[] };
      try { const r = await api("trust", "/revocations"); const v = verifyRevocationList(r.payload_b64, r.signature_b64, keys); list = { version: v.version, ids: v.revokedIds }; } catch { /* none yet */ }
      return { agent, keys, list, agentNote: `Synced: ${Object.keys(keys).length} issuer key, revocation list v${list.version}.`, shown: [] };
    },
  },
  {
    title: "The network goes down", proves: "Problem statement · offline-first",
    story: "This is the situation in the exam question. From here on, the agent's phone cannot reach any server. Everything that follows runs from what it already holds.",
    run: async () => ({ agentOnline: false, agentNote: "No network. All server calls from this phone are blocked.", shown: [] }),
  },
  {
    title: "Musa presents; the agent checks the signature", proves: "FR-16, FR-18 · NFR-S5",
    story: "Musa unlocks his wallet with his PIN and shows the credential. The agent's phone checks the issuer's signature, the expiry and the revocation list, all offline, then shows a fresh one-time challenge.",
    run: async (w) => {
      const r = verifyCredential(decodeQr(w.wallet!.credentialQr!), w.keys, new Set(w.list!.ids), todayIso());
      if (!r.accepted) throw new Error(`Unexpected rejection: ${r.reasons.join(", ")}`);
      const nonce = newChallenge();
      return { payload: r.payload, nonce, agentNote: "Signature genuine, not expired, not revoked. Now proving the holder…", shown: [{ device: "farmer", text: w.wallet!.credentialQr!, label: "Shown to the agent" }, { device: "agent", text: challengeQr(nonce, r.payload!.credentialId), label: "One-time challenge" }] };
    },
  },
  {
    title: "Musa's wallet answers the challenge", proves: "FR-12, FR-17 · STRIDE Spoofing",
    story: "The wallet signs the challenge with the private key that only Musa's phone holds. A screenshot or photocopy could never do this, because it has never seen this challenge.",
    run: async (w) => {
      const seed = await unseal(w.wallet!.sealed, PIN);
      const sig = signChallenge(seed, w.nonce!, w.payload!.credentialId);
      seed.fill(0);
      return { response: responseQr(w.payload!.credentialId, sig), farmerNote: "Answer signed with the device key.", shown: [{ device: "farmer", text: responseQr(w.payload!.credentialId, sig), label: "Signed answer" }] };
    },
  },
  {
    title: "Agent checks the answer and Musa's face: ACCEPTED", proves: "FR-17, FR-19, FR-20, FR-22",
    story: "The agent's phone confirms the answer was signed by the key inside the credential. The agent compares Musa with his details and confirms. The record is queued for upload.",
    run: async (w) => {
      const sig = w.response!.split(":")[2];
      if (!verifyChallengeResponse(w.payload!.holderPublicKey!, w.nonce!, w.payload!.credentialId, sig)) throw new Error("holder check failed");
      return { queue: record(w, true, null, "L2"), verdict: { ok: true, title: "✓ ACCEPTED · An karɓa", detail: `${w.payload!.name}, ${w.payload!.ward}. Verified with no network.` }, agentNote: "Record queued (1 waiting).", shown: [] };
    },
  },
  {
    title: "Attack 1: someone replays a screenshot", proves: "FR-23 · STRIDE Spoofing (replay)",
    story: "Someone has a screenshot of Musa's real QR and the answer his wallet gave a moment ago. The agent shows a NEW challenge. The old answer does not fit it.",
    run: async (w) => {
      const r = await offlineCheck(w, w.credentialQr!, async () => w.response!.split(":")[2]);
      return { queue: record(w, r.ok, r.reason, "L2"), verdict: { ok: r.ok, title: r.ok ? "✓ ACCEPTED" : "✗ REJECTED · An ƙi", detail: r.detail }, shown: [{ device: "agent", text: challengeQr(r.nonce || "", w.credentialId!), label: "New challenge" }] };
    },
  },
  {
    title: "Attack 2: someone edits the QR", proves: "FR-16 · NFR-S5 · STRIDE Tampering",
    story: "A fraudster changes the QR's contents, for example to put in a different name. Without the issuer's private key he cannot make a matching signature.",
    run: async (w) => {
      const q = w.credentialQr!; const i = 60;
      const forged = q.slice(0, i) + (q[i] === "A" ? "B" : "A") + q.slice(i + 1);
      const r = await offlineCheck(w, forged, async () => "");
      return { queue: record(w, false, r.reason, null), verdict: { ok: false, title: "✗ REJECTED · An ƙi", detail: r.detail }, shown: [{ device: "agent", text: forged, label: "Altered code" }] };
    },
  },
  {
    title: "Musa's phone is stolen: the officer revokes", proves: "FR-07, FR-09 · D11",
    story: "Back at the office (online), the officer revokes the credential. The Issuer signs a new revocation list and pushes it to the Trust service. The offline agent cannot know yet.",
    run: async (w) => {
      const r = await api("issuer", `/credentials/${w.credentialId}/revoke`, { token: w.officer!.token, json: { reason: "lost_device" } });
      return { officerNote: `Revoked ${w.credentialId}. List published: ${r.published ? "yes" : "pending"}.`, verdict: null, shown: [] };
    },
  },
  {
    title: "The honest gap: the offline agent still accepts", proves: "Risk register · FR-21",
    story: "The agent is still offline with the old list, so the stolen credential still passes. We do not hide this. It is limited by credential expiry, a warning when the list is over 7 days old, and refusal after 30 days.",
    run: async (w) => {
      const r = await offlineCheck(w, w.credentialQr!, async (n, c) => { const s = await unseal(w.wallet!.sealed, PIN); const sig = signChallenge(s, n, c); s.fill(0); return sig; });
      return { queue: record(w, r.ok, r.reason, "L2"), verdict: { ok: r.ok, title: r.ok ? "✓ ACCEPTED (stale list)" : "✗ REJECTED", detail: r.detail, warn: "Known limitation: revocation reaches an offline point only at its next sync." }, shown: [] };
    },
  },
  {
    title: "Signal returns: the agent syncs and uploads", proves: "FR-15, FR-24 · asynchronous sync",
    story: "When the phone finds signal it downloads the new revocation list and uploads every queued record in one batch. The Audit service chains them by hash.",
    run: async (w) => {
      const r = await api("trust", "/revocations");
      const v = verifyRevocationList(r.payload_b64, r.signature_b64, w.keys);
      const up = await api("audit", "/records", { token: w.agent!.token, json: w.queue });
      return { agentOnline: true, list: { version: v.version, ids: v.revokedIds }, queue: [], verdict: null, agentNote: `Online. Revocation list v${v.version} (${v.revokedIds.length} revoked). Uploaded ${up.accepted} record(s).`, shown: [] };
    },
  },
  {
    title: "The stolen credential is now refused", proves: "FR-18",
    story: "With the fresh list, the same credential is rejected straight away, before any challenge.",
    run: async (w) => {
      const r = await offlineCheck(w, w.credentialQr!, async () => "");
      const up = await api("audit", "/records", { token: w.agent!.token, json: record(w, r.ok, r.reason, "L2") });
      return { verdict: { ok: r.ok, title: r.ok ? "✓ ACCEPTED" : "✗ REJECTED · An ƙi", detail: `${r.detail} (record uploaded: ${up.accepted})` }, shown: [] };
    },
  },
  {
    title: "The auditor checks the chain", proves: "FR-25 · NFR-S6 · STRIDE Repudiation",
    story: "The state M&E officer sees every attempt, accepted and rejected, in a hash-chained log. Editing any record would break the chain.",
    run: async () => {
      const a = await login("auditor1", "Auditor#2026!");
      const [chain, records] = await Promise.all([api("audit", "/records/verify-chain", { token: a.token }), api("audit", "/records", { token: a.token })]);
      return { chain, records: records.slice(-6), verdict: null, shown: [] };
    },
  },
];

export default function Demo() {
  const [w, setW] = useState<World>(fresh);
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const top = useRef<HTMLDivElement>(null);
  const done = i >= STEPS.length;
  const step = STEPS[Math.min(i, STEPS.length - 1)];

  async function next() {
    if (done) return;
    setBusy(true); setErr("");
    try {
      const patch = await STEPS[i].run(w);
      setW((prev) => ({ ...prev, ...patch }));
      setI(i + 1);
    } catch (e) {
      setErr(`${(e as Error).message}. Are the services running? (Terminal 1 / the launcher window)`);
    } finally {
      setBusy(false);
    }
  }
  function restart() { setW(fresh()); setI(0); setErr(""); top.current?.scrollIntoView(); }

  const shownFor = (d: Shown["device"]) => w.shown.filter((s) => s.device === d);
  const active = (d: string) => (!done && STEPS[i] && STEPS[i].title.toLowerCase().includes(d) ? " live" : "");

  return (
    <main className="page wide demo" ref={top}>
      <header className="demohead">
        <div>
          <h1>Guided demo · distribution day in Kura</h1>
          <p className="sub">Real services, real signatures. Press Next step and narrate.</p>
        </div>
        <div className="row">
          <button className="btn ghost small" onClick={restart}>Restart</button>
          <button className="btn" id="demo-next" onClick={next} disabled={busy || done}>{done ? "Demo complete" : busy ? "Working…" : `Next step (${i + 1}/${STEPS.length})`}</button>
        </div>
      </header>

      <section className="card narr">
        <div className="steprail" aria-hidden="true">{STEPS.map((_, k) => <i key={k} className={k < i ? "on" : k === i ? "cur" : ""} />)}</div>
        {i === 0 ? <><h2>Before you start</h2><p>Make sure the services are running. Each press of <strong>Next step</strong> does one real action. The step that just ran is described here, and the three devices below update.</p></>
          : <><span className="eyebrow">Step {i} of {STEPS.length} · proves {STEPS[i - 1].proves}</span><h2>{STEPS[i - 1].title}</h2><p>{STEPS[i - 1].story}</p></>}
        {!done && i > 0 && <p className="sub">Next: {step.title}</p>}
        {err && <p className="msg bad">{err}</p>}
      </section>

      <div className="devices">
        <section className={`card device${active("officer")}`}>
          <div className="dhead"><strong>Officer</strong><span className="sub">LGA office laptop</span><span className="pill ok">Online</span></div>
          {w.officerNote ? <p className="note">{w.officerNote}</p> : <p className="sub">Waiting.</p>}
          {shownFor("officer").map((s, k) => <QrCode key={k} text={s.text} size={180} label={s.label} />)}
        </section>

        <section className={`card device${active("farmer") || active("musa") || active("wallet")}`}>
          <div className="dhead"><strong>Farmer · Musa</strong><span className="sub">Wallet on a shared phone</span><span className="pill ok">Needs no network</span></div>
          {w.farmerNote ? <p className="note">{w.farmerNote}</p> : <p className="sub">Waiting.</p>}
          {shownFor("farmer").map((s, k) => <QrCode key={k} text={s.text} size={180} label={s.label} />)}
        </section>

        <section className={`card device${active("agent")}`}>
          <div className="dhead"><strong>Agent</strong><span className="sub">Verifier at KURA-01</span>
            <span className={`pill ${w.agentOnline ? "ok" : "bad"}`}>{w.agentOnline ? "Online" : "Offline"}</span></div>
          {w.agentNote ? <p className="note">{w.agentNote}</p> : <p className="sub">Waiting.</p>}
          {w.list && <p className="sub">List v{w.list.version} · {w.queue.length} record(s) waiting to upload</p>}
          {shownFor("agent").map((s, k) => <QrCode key={k} text={s.text} size={180} label={s.label} />)}
          {w.verdict && (
            <div className={`verdict mini ${w.verdict.ok ? "ok" : "bad"}`}>
              <div className="big">{w.verdict.title}</div><p>{w.verdict.detail}</p>
              {w.verdict.warn && <p className="msg warn">{w.verdict.warn}</p>}
            </div>
          )}
        </section>
      </div>

      {w.chain && (
        <section className={`card verdict ${w.chain.intact ? "ok" : "bad"}`}>
          <div className="big">{w.chain.intact ? "✓ Audit chain intact" : "✗ Audit chain broken"}</div>
          <p>{w.chain.records} records in total · latest shown below</p>
          <table className="tbl"><thead><tr><th>#</th><th>Point</th><th>Credential</th><th>Result</th><th>Reason</th></tr></thead>
            <tbody>{w.records.map((r) => <tr key={r.seq}><td>{r.seq}</td><td>{r.point_id}</td><td className="mono">{r.credential_id}</td><td className={r.result === "accepted" ? "okt" : "badt"}>{r.result}</td><td>{r.reason || ""}</td></tr>)}</tbody></table>
        </section>
      )}
    </main>
  );
}
