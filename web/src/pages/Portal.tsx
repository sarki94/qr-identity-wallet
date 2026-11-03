/** Issuer Portal (enrolment officer, online): enrol, bind wallet, issue L2/L1, revoke (FR-01 to FR-07). */
import { useState } from "react";
import { api, Session } from "../lib/api";
import { b64urlEncode, parseTagged } from "../lib/qrw";
import { load, save } from "../lib/store";
import { Login } from "../components/Login";
import { QrCode } from "../components/QrCode";
import { Scanner } from "../components/Scanner";

interface Farmer { id: number; nin_masked: string; name: string; ward: string; lga: string; state: string; active_credential_id: string | null }
interface Cred { id: string; level: string; status: string; issued_on: string; expires_on: string; revoked_reason: string | null; qr_text: string }

async function photoToB64(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const size = 96;
  const scale = Math.max(size / img.width, size / img.height);
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, (size - img.width * scale) / 2, (size - img.height * scale) / 2, img.width * scale, img.height * scale);
  for (const q of [0.6, 0.45, 0.3]) {
    const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), "image/jpeg", q));
    const b64 = b64urlEncode(new Uint8Array(await blob.arrayBuffer()));
    if (b64.length <= 1400) return b64;
  }
  throw new Error("Photo too detailed to fit in the QR. Try a plainer background.");
}

export default function Portal() {
  const [session, setSession] = useState<Session | null>(() => load("qrw.portal.session", null));
  const [nin, setNin] = useState("");
  const [farmer, setFarmer] = useState<Farmer | null>(null);
  const [creds, setCreds] = useState<Cred[]>([]);
  const [level, setLevel] = useState<"L2" | "L1">("L2");
  const [holderKey, setHolderKey] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [issued, setIssued] = useState<Cred | null>(null);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [reason, setReason] = useState("lost_device");

  function signIn(s: Session) { setSession(s); save("qrw.portal.session", s); }
  const token = session?.token || "";
  const err = (e: unknown) => setMsg({ kind: "bad", text: (e as Error).message });

  async function refresh(f: Farmer) {
    setCreds(await api("issuer", `/farmers/${f.id}/credentials`, { token }));
  }

  async function enrol(e: React.FormEvent) {
    e.preventDefault(); setMsg(null); setIssued(null);
    try {
      const f = await api<Farmer>("issuer", "/enrolments", { token, json: { nin } });
      setFarmer(f); await refresh(f);
    } catch (x) { err(x); }
  }

  async function issue() {
    if (!farmer) return;
    setMsg(null);
    try {
      const body: Record<string, unknown> = { farmer_id: farmer.id, level };
      if (level === "L2") body.holder_public_key = holderKey;
      if (photo) body.photo = photo;
      const c = await api<Cred & { published: boolean }>("issuer", "/credentials", { token, json: body });
      setIssued(c); await refresh(farmer);
      setMsg({ kind: "ok", text: `Issued ${c.id} (${c.level}).${c.published ? "" : " Revocation list not yet published; it will retry."}` });
    } catch (x) { err(x); }
  }

  async function revoke(id: string) {
    try {
      const r = await api("issuer", `/credentials/${id}/revoke`, { token, json: { reason } });
      setMsg({ kind: r.published ? "ok" : "warn", text: r.published ? `Revoked ${id}. Distribution points will refuse it after their next sync.` : `Revoked ${id}, but publishing failed; press "Republish".` });
      if (farmer) await refresh(farmer);
      if (issued?.id === id) setIssued(null);
    } catch (x) { err(x); }
  }

  if (!session || session.expiresAt < Date.now()) {
    return <main className="page"><h1>Issuer Portal</h1><Login role="Officer" hint="officer1" onLogin={signIn} /></main>;
  }

  return (
    <main className="page wide">
      <header className="bar noprint"><div><h1>Issuer Portal</h1><span className="sub">{session.username} · LGA enrolment office</span></div>
        <button className="btn ghost small" onClick={() => { setSession(null); save("qrw.portal.session", null); }}>Sign out</button></header>

      <form className="card noprint" onSubmit={enrol}>
        <h2>1 · Enrol farmer</h2>
        <label htmlFor="p-nin">NIN (11 digits)</label>
        <div className="row"><input id="p-nin" inputMode="numeric" maxLength={11} value={nin} onChange={(e) => setNin(e.target.value.replace(/\D/g, ""))} placeholder="12345678901" />
          <button className="btn" disabled={nin.length !== 11}>Look up at NIMC</button></div>
      </form>

      {farmer && (
        <section className="card noprint">
          <h2>2 · Issue credential to {farmer.name}</h2>
          <p className="sub">{farmer.ward}, {farmer.lga}, {farmer.state} · NIN {farmer.nin_masked}{farmer.active_credential_id ? " · has an active credential (issuing again revokes it)" : ""}</p>
          <div className="row">
            <label className="choice"><input type="radio" name="lvl" checked={level === "L2"} onChange={() => setLevel("L2")} /> L2 · smartphone wallet</label>
            <label className="choice"><input type="radio" name="lvl" checked={level === "L1"} onChange={() => setLevel("L1")} /> L1 · paper wallet</label>
          </div>
          {level === "L2" && (holderKey ? <p className="msg ok">Wallet bound: {holderKey.slice(0, 16)}…</p> :
            <Scanner prompt="Scan the binding code on the farmer's wallet" onResult={(t) => {
              try { setHolderKey(parseTagged(t, "QRW1B")[0]); } catch { setMsg({ kind: "bad", text: "That is not a wallet binding code." }); }
            }} />)}
          <label htmlFor="p-photo">Photo (optional, stored in the signed credential)</label>
          <input id="p-photo" type="file" accept="image/*" capture="user" onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            try { setPhoto(await photoToB64(f)); } catch (x) { err(x); }
          }} />
          {photo && <img className="photo" alt="Thumbnail to be signed" src={`data:image/jpeg;base64,${photo.replace(/-/g, "+").replace(/_/g, "/")}`} />}
          <button className="btn" disabled={level === "L2" && !holderKey} onClick={issue}>Sign and issue</button>
        </section>
      )}

      {msg && <p className={`msg ${msg.kind} noprint`}>{msg.text}</p>}

      {issued && (
        <section className="card center printable">
          <h2 className="noprint">{issued.level === "L2" ? "3 · Farmer scans this into the wallet" : "3 · Print the paper wallet"}</h2>
          <div className="papercard">
            <QrCode text={issued.qr_text} size={320} />
            <div><strong>{farmer?.name}</strong><br />{farmer?.ward}, {farmer?.lga}<br />Valid to {issued.expires_on}<br /><span className="sub">{issued.id} · {issued.level}</span></div>
          </div>
          {issued.level === "L1" && <button className="btn noprint" onClick={() => window.print()}>Print</button>}
        </section>
      )}

      {farmer && creds.length > 0 && (
        <section className="card noprint">
          <h2>Credentials for {farmer.name}</h2>
          <div className="row"><label htmlFor="p-reason">Revocation reason</label>
            <select id="p-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="lost_device">Lost or stolen phone</option><option value="death">Death</option>
              <option value="fraud">Fraud</option><option value="other">Other</option></select></div>
          <table className="tbl"><thead><tr><th>ID</th><th>Level</th><th>Status</th><th>Expires</th><th /></tr></thead>
            <tbody>{creds.map((c) => (
              <tr key={c.id}><td className="mono">{c.id}</td><td>{c.level}</td><td>{c.status}{c.revoked_reason ? ` (${c.revoked_reason})` : ""}</td><td>{c.expires_on}</td>
                <td>{c.status === "Active" && <button className="btn badb small" onClick={() => revoke(c.id)}>Revoke</button>}</td></tr>))}</tbody></table>
          <button className="btn ghost small" onClick={async () => { try { const r = await api("issuer", "/revocations/publish", { token, method: "POST" }); setMsg({ kind: r.published ? "ok" : "warn", text: r.published ? "Revocation list republished." : "Trust service unreachable." }); } catch (x) { err(x); } }}>Republish revocation list</button>
        </section>
      )}
    </main>
  );
}
