import { Link, Route } from "../lib/router";

const SCREENS: { to: Route; title: string; who: string; note: string }[] = [
  { to: "/demo", title: "Guided demo", who: "One laptop or projector: all three devices on one screen", note: "Best for testing and the oral defence" },
  { to: "/verifier", title: "Verifier", who: "Redemption agent at the distribution point", note: "Works offline after one sync" },
  { to: "/wallet", title: "Wallet", who: "Farmer's phone (one phone, many profiles)", note: "Works offline always" },
  { to: "/portal", title: "Issuer Portal", who: "Enrolment officer, LGA office", note: "Needs network" },
  { to: "/audit", title: "Audit", who: "State M&E officer", note: "Needs network" },
];

export default function Home() {
  return (
    <main className="page">
      <h1>QR Identity Wallet</h1>
      <p className="lede">Offline identity checks for subsidised fertiliser collection. Pick the screen for this device.</p>
      <div className="stack">
        {SCREENS.map((s) => (
          <Link key={s.to} to={s.to} className="card tile"><strong>{s.title}</strong><span>{s.who}</span><span className="sub">{s.note}</span></Link>
        ))}
      </div>
    </main>
  );
}
