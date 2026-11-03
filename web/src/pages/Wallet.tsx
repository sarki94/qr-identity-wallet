/** Citizen wallet: several PIN-protected profiles on one shared phone (FR-10, FR-11, FR-12, FR-13). */
import { useState } from "react";
import { bindingQr, decodeQr, newHolderKey, parseTagged, responseQr, signChallenge } from "../lib/qrw";
import { load, save } from "../lib/store";
import { seal, Sealed, unseal } from "../lib/vault";
import { QrCode } from "../components/QrCode";
import { Scanner } from "../components/Scanner";

interface Profile { id: string; label: string; publicKey: string; sealed: Sealed; credentialQr: string | null; failed: number; lockedUntil: number }
const MAX_TRIES = 5;
const LOCK_MS = 5 * 60_000;

type View = { v: "list" } | { v: "new" } | { v: "bind"; id: string } | { v: "add"; id: string } | { v: "open"; id: string }
  | { v: "show"; id: string; seed: Uint8Array } | { v: "answer"; id: string; seed: Uint8Array; response?: string };

export default function Wallet() {
  const [profiles, setProfiles] = useState<Profile[]>(() => load("qrw.wallet.profiles", []));
  const [view, setView] = useState<View>({ v: "list" });
  const [label, setLabel] = useState("");
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState("");

  function persist(next: Profile[]) { setProfiles(next); save("qrw.wallet.profiles", next); }
  const byId = (id: string) => profiles.find((p) => p.id === id)!;

  async function create() {
    if (!label.trim() || !/^\d{6}$/.test(pin)) return setMsg("Enter a name and a 6-digit PIN.");
    const k = newHolderKey();
    const p: Profile = { id: k.publicKey.slice(0, 10), label: label.trim(), publicKey: k.publicKey, sealed: await seal(k.seed, pin), credentialQr: null, failed: 0, lockedUntil: 0 };
    k.seed.fill(0);
    persist([...profiles, p]); setLabel(""); setPin(""); setMsg(""); setView({ v: "bind", id: p.id });
  }

  async function unlock(id: string) {
    const p = byId(id);
    if (p.lockedUntil > Date.now()) return setMsg(`Too many wrong PINs. Try again in ${Math.ceil((p.lockedUntil - Date.now()) / 60000)} min.`);
    try {
      const seed = await unseal(p.sealed, pin);
      persist(profiles.map((x) => (x.id === id ? { ...x, failed: 0 } : x)));
      setPin(""); setMsg(""); setView({ v: "show", id, seed });
    } catch {
      const failed = p.failed + 1;
      persist(profiles.map((x) => (x.id === id ? { ...x, failed: failed >= MAX_TRIES ? 0 : failed, lockedUntil: failed >= MAX_TRIES ? Date.now() + LOCK_MS : 0 } : x)));
      setPin(""); setMsg(failed >= MAX_TRIES ? "Wrong PIN 5 times. Profile locked for 5 minutes." : `Wrong PIN (${MAX_TRIES - failed} tries left).`);
    }
  }

  function addCredential(id: string, text: string) {
    try {
      const signed = decodeQr(text);
      const body = JSON.parse(new TextDecoder().decode(signed.payloadBytes));
      if (body.hpk !== byId(id).publicKey) throw new Error("This credential is bound to a different wallet.");
      persist(profiles.map((x) => (x.id === id ? { ...x, credentialQr: text } : x)));
      setMsg(`Credential for ${body.nm} saved.`); setView({ v: "list" });
    } catch (e) {
      setMsg((e as Error).message.includes("different") ? (e as Error).message : "That is not a credential QR.");
    }
  }

  return (
    <main className="page">
      <header className="bar"><div><h1>Wallet</h1><span className="sub">Works with no network</span></div></header>
      {msg && <p className="msg">{msg}</p>}

      {view.v === "list" && (
        <section className="stack">
          {profiles.length === 0 && <p className="card">No profiles yet. One phone can hold several family members, each with their own PIN.</p>}
          {profiles.map((p) => (
            <div key={p.id} className="card prof">
              <div><strong>{p.label}</strong><span className="sub">{p.credentialQr ? "Credential saved" : "Not yet issued"}</span></div>
              <div className="row">
                {p.credentialQr ? <button className="btn" onClick={() => { setMsg(""); setView({ v: "open", id: p.id }); }}>Present</button>
                  : <><button className="btn ghost" onClick={() => setView({ v: "bind", id: p.id })}>Binding code</button>
                    <button className="btn" onClick={() => setView({ v: "add", id: p.id })}>Add credential</button></>}
              </div>
            </div>
          ))}
          <button className="btn ghost" onClick={() => { setMsg(""); setView({ v: "new" }); }}>+ New profile</button>
        </section>
      )}

      {view.v === "new" && (
        <section className="card">
          <h2>New profile</h2>
          <label htmlFor="w-label">Name</label><input id="w-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Musa Ibrahim" />
          <label htmlFor="w-pin">6-digit PIN</label><input id="w-pin" inputMode="numeric" maxLength={6} type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
          <p className="sub">A private key is created on this phone and locked with the PIN. It never leaves the phone.</p>
          <div className="row"><button className="btn" onClick={create}>Create</button><button className="btn ghost" onClick={() => setView({ v: "list" })}>Cancel</button></div>
        </section>
      )}

      {view.v === "bind" && (
        <section className="card center">
          <h2>Show this to the enrolment officer</h2>
          <QrCode text={bindingQr(byId(view.id).publicKey)} size={240} label="Binding code (public key only)" />
          <button className="btn" onClick={() => setView({ v: "add", id: view.id })}>Next: add my credential</button>
        </section>
      )}

      {view.v === "add" && <section className="card"><h2>Add credential</h2><Scanner prompt="Scan the credential QR on the officer's screen" onResult={(t) => addCredential(view.id, t)} /></section>}

      {view.v === "open" && (
        <section className="card">
          <h2>{byId(view.id).label}: enter PIN</h2>
          <input id="w-unlock" inputMode="numeric" maxLength={6} type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
          <div className="row"><button className="btn" onClick={() => unlock(view.id)}>Unlock</button><button className="btn ghost" onClick={() => setView({ v: "list" })}>Back</button></div>
        </section>
      )}

      {view.v === "show" && (
        <section className="card center">
          <h2>Show to the agent</h2>
          <QrCode text={byId(view.id).credentialQr!} size={300} label={byId(view.id).label} />
          <button className="btn" onClick={() => setView({ v: "answer", id: view.id, seed: view.seed })}>Agent shows a challenge →</button>
          <button className="btn ghost" onClick={() => { view.seed.fill(0); setView({ v: "list" }); }}>Close</button>
        </section>
      )}

      {view.v === "answer" && (
        <section className="card center">
          {!view.response ? (
            <Scanner prompt="Scan the challenge on the agent's phone" onResult={(t) => {
              try {
                const [credId, nonce] = parseTagged(t, "QRW1C");
                const own = JSON.parse(new TextDecoder().decode(decodeQr(byId(view.id).credentialQr!).payloadBytes)).id;
                if (credId !== own) throw new Error();
                setView({ ...view, response: responseQr(credId, signChallenge(view.seed, nonce, credId)) });
              } catch { setMsg("That is not a challenge for this credential."); }
            }} />
          ) : (
            <>
              <h2>Show this answer to the agent</h2>
              <QrCode text={view.response} size={240} label="Signed answer (single use)" />
              <button className="btn ghost" onClick={() => { view.seed.fill(0); setView({ v: "list" }); }}>Done</button>
            </>
          )}
        </section>
      )}
    </main>
  );
}

