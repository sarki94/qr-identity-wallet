# OWASP ZAP dynamic scan (DAST), 4 November 2026

**Tool:** OWASP ZAP 2.16.1 (named in the lecture notes for DAST), daemon mode, driven by `tools/zap_scan.py`.
**Target:** all five services running locally (`python services/scripts/run_local.py`).
**Method:** each service's OpenAPI description was imported so ZAP knew every endpoint; a valid token for a suitable role
was attached to every request (admin for Auth, officer for Issuer, auditor for Audit); then ZAP's passive rules and
full default active-scan policy (SQL injection, XSS, path traversal, command injection, SSRF and others) ran.
About 6,860 requests per scan.

| Risk | Before fix (`before/`) | After fix (`after/`) |
|---|---|---|
| High | 0 | 0 |
| Medium | 1: CSP header not set (rule 10038) on the five `/docs` pages | **0** |
| Low | 1: cross-domain JavaScript inclusion (10017) on `/docs` | 1 (accepted, see below) |
| Informational | 3 | 3 |

**Finding and fix.** The API endpoints already sent `Content-Security-Policy: default-src 'none'`, but the interactive
documentation pages (`/docs`) were exempted so Swagger UI could load. Tests TC-SEC-011 and TC-SEC-012 were written first
(red), then the fix: the docs pages now get their own strict policy (scripts only from this origin, the pinned CDN, or the
page's inline script by SHA-256 hash; no `'unsafe-inline'` or `'unsafe-eval'`; no framing), and `QRW_API_DOCS=0` removes
the docs pages and `/openapi.json` entirely for production. A first attempt still allowed inline styles; ZAP raised rule
10055 (CSP style-src unsafe-inline, Medium), so inline styles were removed as well after checking in a browser that
Swagger UI still works without them.

**Accepted (Low):** Swagger UI loads its script from cdn.jsdelivr.net. This is a developer page, the CDN is pinned in the
CSP, and production switches the page off (`QRW_API_DOCS=0`, TC-SEC-012).
**Informational:** "Authentication request identified" (the login endpoint, expected), "Modern web application" and
"User agent fuzzer" (responses did not change by user agent) need no action.

Notable: during the scan the login rate limiter returned HTTP 429 to ZAP's fuzzing of `/token`, which is the intended
behaviour (NFR-S7).

Files: `before/` and `after/` each hold `zap-report.html` (full report), `zap-report.json`, `zap-summary.json`,
`zap-summary.png`.
