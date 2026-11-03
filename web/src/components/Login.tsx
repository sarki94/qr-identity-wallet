import { useState } from "react";
import { login, Session } from "../lib/api";

export function Login({ role, onLogin, hint }: { role: string; onLogin: (s: Session) => void; hint: string }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const s = await login(u, p);
      if (s.role !== role) throw new Error(`This screen is for the ${role} role; ${u} is ${s.role}.`);
      onLogin(s);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="card" onSubmit={submit}>
      <h2>Sign in ({role})</h2>
      <label htmlFor="login-user">Username</label>
      <input id="login-user" value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" placeholder={hint} />
      <label htmlFor="login-pass">Password</label>
      <input id="login-pass" type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" />
      <button className="btn" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      {err && <p className="msg bad">{err}</p>}
    </form>
  );
}
