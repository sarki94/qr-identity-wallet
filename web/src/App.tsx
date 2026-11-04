import { Link, usePath } from "./lib/router";
import Home from "./pages/Home";
import Demo from "./pages/Demo";
import Verifier from "./pages/Verifier";
import Wallet from "./pages/Wallet";
import Portal from "./pages/Portal";
import Audit from "./pages/Audit";

const SCREENS = { "/": Home, "/demo": Demo, "/verifier": Verifier, "/wallet": Wallet, "/portal": Portal, "/audit": Audit };

export default function App() {
  const path = usePath();
  const Screen = SCREENS[path];
  return (
    <>
      <nav className="nav noprint">
        <Link to="/">Home</Link><Link to="/demo">Demo</Link><Link to="/verifier">Verifier</Link>
        <Link to="/wallet">Wallet</Link><Link to="/portal">Portal</Link><Link to="/audit">Audit</Link>
      </nav>
      <Screen key={path} />
    </>
  );
}
