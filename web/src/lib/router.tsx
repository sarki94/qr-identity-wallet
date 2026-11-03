/**
 * Minimal client-side router for six fixed screens. It replaced react-router-dom to remove a
 * dependency with open-redirect advisories (see docs/evidence/npm-audit-*.txt). Navigation only
 * ever targets the hard-coded internal paths below, never user-supplied URLs.
 */
import { MouseEvent, ReactNode, useEffect, useState } from "react";

export const ROUTES = ["/", "/demo", "/verifier", "/wallet", "/portal", "/audit"] as const;
export type Route = (typeof ROUTES)[number];

function current(): Route {
  const p = window.location.pathname.replace(/\/+$/, "") || "/";
  return (ROUTES as readonly string[]).includes(p) ? (p as Route) : "/";
}

export function navigate(to: Route): void {
  if (!(ROUTES as readonly string[]).includes(to)) return;
  window.history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function usePath(): Route {
  const [path, setPath] = useState<Route>(current);
  useEffect(() => {
    const onPop = () => setPath(current());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return path;
}

export function Link({ to, className, children }: { to: Route; className?: string; children: ReactNode }) {
  const path = usePath();
  const onClick = (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // let the browser open new tabs
    e.preventDefault();
    navigate(to);
  };
  return <a href={to} className={[className, path === to ? "active" : ""].filter(Boolean).join(" ")} onClick={onClick}>{children}</a>;
}
