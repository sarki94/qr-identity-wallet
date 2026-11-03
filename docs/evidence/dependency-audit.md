# Dependency audit (3 November 2026)

Tools: `pip-audit` (Python, PyPI advisory database) and `npm audit` (Node, GitHub advisory database). The lecturer named Snyk for dependency scanning; these are free equivalents that query the same public vulnerability databases.

## Python (core + services)

`pip-audit --skip-editable` → **No known vulnerabilities found** (`pip-audit.md`). Our own two packages are skipped because they are not on PyPI.

## Web app: runtime dependencies (shipped to phones)

| Finding | Before | Action | After |
|---|---|---|---|
| react-router-dom 6.27.0: open redirect / XSS advisories (GHSA-2w69-qvjg-hvjx, GHSA-2j2x-hqr9-3h42, GHSA-9jcx-v3wj-wh4m) | 3 high | Upgraded to 6.30.6 | 2 moderate remain (GHSA-wrjc-x8rr-h8h6, GHSA-337j-9hxr-rhxg); fix only in v7 (breaking) |
| Remaining react-router advisories | 2 moderate | **Removed the dependency**: replaced with a 50-line internal router (`web/src/lib/router.tsx`) that only navigates to six hard-coded paths | **0 vulnerabilities** |

Evidence: `npm-audit-runtime-before.txt`, `npm-audit-runtime-after.txt`.

## Web app: development-only tooling

`npm audit` (all) still lists advisories in build and test tools (vite, esbuild dev server, vitest, workbox-build and their sub-dependencies). None of these packages is shipped to users: the phones receive only the built static files in `web/dist`. The dev server is only run on the developer's own laptop.

**Decision:** accepted for the prototype. **Planned adaptive maintenance:** upgrade Vite 5 → current major and Vitest 2 → current major after submission, then re-run this audit (see the maintenance plan). Evidence: `npm-audit-all-before.txt`, `npm-audit-all-after.txt`.

## In CI

Every push runs `pip-audit` and `npm audit --omit=dev --audit-level=moderate`, so a new advisory in a shipped dependency fails the build.
