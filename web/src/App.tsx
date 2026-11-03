import { NavLink, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Verifier from "./pages/Verifier";
import Wallet from "./pages/Wallet";
import Portal from "./pages/Portal";
import Audit from "./pages/Audit";
import Demo from "./pages/Demo";

export default function App() {
  return (
    <>
      <nav className="nav noprint">
        <NavLink to="/" end>Home</NavLink><NavLink to="/demo">Guided demo</NavLink><NavLink to="/verifier">Verifier</NavLink><NavLink to="/wallet">Wallet</NavLink>
        <NavLink to="/portal">Portal</NavLink><NavLink to="/audit">Audit</NavLink>
      </nav>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/verifier" element={<Verifier />} />
        <Route path="/wallet" element={<Wallet />} />
        <Route path="/portal" element={<Portal />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="/demo" element={<Demo />} />
      </Routes>
    </>
  );
}
