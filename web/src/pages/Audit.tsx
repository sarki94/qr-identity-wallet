/** Auditor view: verification records, chain integrity check and cloning flags (FR-25, FR-26). */
import { useEffect, useState } from "react";
import { api, Session } from "../lib/api";
import { load, save } from "../lib/store";
import { Login } from "../components/Login";

export default function Audit() {
  const [session, setSession] = useState<Session | null>(() => load("qrw.audit.session", null));
  const [rows, setRows] = useState<any[]>([]);
  const [chain, setChain] = useState<any>(null);
  const [flags, setFlags] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const token = session?.token || "";

  async function refresh() {
    setErr("");
    try {
      const [r, c, a] = await Promise.all([api("audit", "/records", { token }), api("audit", "/records/verify-chain", { token }), api("audit", "/anomalies", { token })]);
      setRows(r); setChain(c); setFlags(a.flags);
    } catch (e) { setErr((e as Error).message); }
  }
  useEffect(() => { if (session) refresh(); }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!session || session.expiresAt < Date.now()) {
    return <main className="page"><h1>Audit</h1><Login role="Auditor" hint="auditor1" onLogin={(s) => { setSession(s); save("qrw.audit.session", s); }} /></main>;
  }
  return (
    <main className="page wide">
      <header className="bar"><div><h1>Audit</h1><span className="sub">{session.username}</span></div>
        <button className="btn" onClick={refresh}>Refresh</button></header>
      {err && <p className="msg bad">{err}</p>}
      {chain && <section className={`card verdict ${chain.intact ? "ok" : "bad"}`}>
        <div className="big">{chain.intact ? "✓ Chain intact" : `✗ Chain broken at record #${chain.first_broken_seq}`}</div>
        <p>{chain.records} records · head {String(chain.head_hash).slice(0, 16)}…</p></section>}
      {flags.length > 0 && <section className="card"><h2>Possible cloning</h2>
        {flags.map((f, i) => <p key={i} className="msg warn">{f.credential_id}: accepted at {f.first.point_id} and {f.second.point_id} within 24 h</p>)}</section>}
      <section className="card"><h2>Verification records</h2>
        <table className="tbl"><thead><tr><th>#</th><th>Time</th><th>Point</th><th>Agent</th><th>Credential</th><th>Result</th><th>Level</th><th>Reason</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.seq}><td>{r.seq}</td><td>{String(r.verified_at).slice(0, 19).replace("T", " ")}</td><td>{r.point_id}</td><td>{r.agent}</td>
            <td className="mono">{r.credential_id}</td><td className={r.result === "accepted" ? "okt" : "badt"}>{r.result}</td><td>{r.level || "—"}</td><td>{r.reason || ""}</td></tr>)}</tbody></table>
      </section>
      <button className="btn ghost small" onClick={() => { setSession(null); save("qrw.audit.session", null); }}>Sign out</button>
    </main>
  );
}
