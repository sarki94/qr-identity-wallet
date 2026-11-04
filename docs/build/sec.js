const fs = require("fs");
const path = require("path");
const { Doc } = require("./lib");
const UML = process.env.UML_PNG;
const ROOT = path.resolve(__dirname, "../..");

// The STRIDE rows are read from docs/security.md so the report and the repository never disagree.
const md = fs.readFileSync(path.join(ROOT, "docs/security.md"), "utf8");
function mdTable(heading) {
  const sec = md.slice(md.indexOf(heading));
  const lines = sec.split("\n").filter((l) => l.startsWith("|"));
  const out = [];
  for (const l of lines.slice(2)) {
    const cells = l.slice(1, -1).split("|").map((c) => c.trim().replace(/\\\*/g, "•").replace(/`/g, ""));
    out.push(cells);
    if (!sec.split("\n")[sec.split("\n").indexOf(l) + 1]?.startsWith("|")) break;
  }
  return out;
}
const stride = mdTable("## 2. STRIDE threat model").map((r) => [r[0].replace(/\*\*(.)\*\*/, "$1"), r[1], r[2], r[3]]);

const doc = new Doc({ code: "QRW-SEC-03", title: "Security Engineering Report", version: "1.0", date: "November 2026",
  related: "QRW-SRS-01 Requirements · QRW-SDD-02 Design · QRW-TST-04 Test Plan & Report" });

// =====================================================================
doc.h1("Introduction");
doc.h2("Purpose");
doc.p("This report sets out how security was engineered into the Offline-First Cryptographic QR Identity Wallet. It identifies the assets worth protecting and the trust boundaries they cross, models the threats with STRIDE, shows how the secure-design principles of least privilege, defence in depth and failing securely were applied, describes the authentication and authorisation scheme, and presents the evidence from static analysis, dependency scanning, dynamic scanning and security test cases. Remaining risks are carried to the risk register in QRW-PRM-05.");
doc.h2("Scope");
doc.p("The report covers the cryptographic core library, the five services (Auth, Issuer, Trust and Revocation, Audit and Sync, and the mock NIMC) and the web application with its Wallet, Verifier, Issuer Portal and Audit screens. Physical security of distribution points, the security of NIMC itself and the device operating systems are outside its scope and are recorded as assumptions.");
doc.h2("Method");
doc.p("Threats were identified with Microsoft's STRIDE model, as taught in the course, applied to each trust boundary of the data-flow diagram in Section 3. Each threat is stated concretely for this system, linked to the security property it violates, and given a mitigation that names the test cases verifying it. The test identifiers match the Requirements Traceability Matrix (QRW-SRS-01, Appendix A) and the Test Plan and Report (QRW-TST-04).");
doc.h2("References");
doc.references([
  "Josefsson, S., & Liusvaara, I. (2017). *Edwards-curve digital signature algorithm (EdDSA)* (RFC 8032). Internet Engineering Task Force. https://doi.org/10.17487/RFC8032",
  "Moriarty, K., Kaliski, B., & Rusch, A. (2017). *PKCS #5: Password-based cryptography specification version 2.1* (RFC 8018). Internet Engineering Task Force. https://doi.org/10.17487/RFC8018",
  "Percival, C., & Josefsson, S. (2016). *The scrypt password-based key derivation function* (RFC 7914). Internet Engineering Task Force. https://doi.org/10.17487/RFC7914",
  "Shostack, A. (2014). *Threat modeling: Designing for security*. Wiley.",
  "Nigeria Data Protection Commission. (2023). *Nigeria Data Protection Act, 2023*. Federal Republic of Nigeria.",
  "OWASP Foundation. (2021). *OWASP top 10: 2021*. https://owasp.org/Top10/",
  "Saltzer, J. H., & Schroeder, M. D. (1975). The protection of information in computer systems. *Proceedings of the IEEE, 63*(9), 1278–1308. https://doi.org/10.1109/PROC.1975.9939",
]);

// =====================================================================
doc.h1("Assets and Security Objectives");
doc.h2("Assets");
doc.p(`The assets are listed in Table ${doc.peekTable()} in order of value. The ranking drives the design: the most valuable asset, the issuer signing key, is held by only one component.`);
doc.table("Assets ranked by value", ["Rank", "Asset", "Why it matters", "Where it lives"], [
  ["1", "Issuer signing key (Ed25519)", "Whoever holds it can create identities that every verifier accepts", "Issuer service only; encrypted at rest"],
  ["2", "Holder device keys", "Prove that the person presenting is the person enrolled", "Each wallet profile, sealed under its PIN"],
  ["3", "Revocation list", "A forged or stale list lets revoked credentials pass", "Issuer (signs), Trust (publishes), verifier caches"],
  ["4", "Audit records", "Evidence of who was verified, where, and with what result", "Verifier queue, then the Audit service"],
  ["5", "Personal data (NIN, name, ward, photo)", "Protected under the Nigeria Data Protection Act 2023", "Issuer database (NIN hashed), credential (NIN masked)"],
  ["6", "Staff accounts and tokens", "Grant the power to issue, revoke, verify or read audit logs", "Auth service; tokens on staff devices"],
], [8, 24, 40, 28]);
doc.h2("Security Objectives");
doc.p(`The security requirements of QRW-SRS-01 are restated in Table ${doc.peekTable()} with the property each protects.`);
doc.table("Security requirements and properties", ["ID", "Requirement", "Property"], [
  ["NFR-S1", "Ed25519 signing; issuer private key only in the Issuer, encrypted at rest (HSM in production)", "Integrity, authenticity"],
  ["NFR-S2", "Holder private keys sealed with a PIN-derived key (PBKDF2 and AES-GCM)", "Confidentiality, authentication"],
  ["NFR-S3", "TLS on all traffic (prototype: HTTPS between phones and the app)", "Confidentiality, integrity"],
  ["NFR-S4", "Data minimisation: masked NIN only; full NIN never stored", "Confidentiality, privacy"],
  ["NFR-S5", "Fail securely: any error, unknown key or bad input is a rejection", "Integrity, availability"],
  ["NFR-S6", "Audit records tamper-evident (hash chain)", "Non-repudiation, integrity"],
  ["NFR-S7", "Login rate-limited; account locks after five failed logins", "Authentication, availability"],
  ["NFR-S8", "Nigeria Data Protection Act 2023 principles", "Privacy, lawfulness"],
], [12, 62, 26]);

// =====================================================================
doc.h1("Trust Boundaries and Data Flows");
doc.p(`Figure ${doc.peekFig()} shows the data flows and the six trust boundaries (B1 to B6) at which data passes between parties that trust each other differently. Each boundary is a place where an attacker can inject, observe or alter data, so the STRIDE analysis in Section 4 is applied boundary by boundary.`);
doc.figure("Data-flow diagram with trust boundaries", `${UML}/TM1.png`, 16);
doc.table("Trust boundaries", ["ID", "Between", "Crossing protected by"], mdTable("**Trust boundaries**").map((r) => [r[0], r[1], r[2]]), [8, 44, 48]);

// =====================================================================
doc.h1("STRIDE Threat Model");
doc.p("The threat model uses the four-column STRIDE format given in the course: threat category, security property violated, definition and mitigation. The definition states the concrete threat in this system, numbered by category (S1, T1 and so on); the mitigation names the controls and, in italics, the test cases that verify them.");
doc.p(`Nineteen threats were identified across the six categories (Table ${doc.peekTable()}). Every threat has at least one implemented mitigation verified by at least one test; for R2 a residual part remains, noted in the table and in Section 8.`);
doc.table("STRIDE threat model", ["Threat category", "Security property violated", "Definition (threat in this system)", "Mitigation (and verifying tests)"], stride, [12, 17, 29, 42], { size: 17 });
doc.p("The mitigations correspond to those given in the course for each category: digital signatures and HMACs for tampering, signed audit logs for repudiation, encryption and access control for information disclosure, and rate limiting and quotas for denial of service. Multi-factor authentication for staff and mutual TLS between services were considered and deferred; Section 8 explains why and what replaces them in the prototype.");

// =====================================================================
doc.h1("Secure-Design Principles");
doc.p(`Table ${doc.peekTable()} shows where each principle from Saltzer and Schroeder (1975), as taught in the course, is applied. The first three are the ones named in the examination rubric.`);
doc.table("Secure-design principles applied", ["Principle", "Where it is applied"], mdTable("## 3. Secure-design principles applied").map((r) => [r[0], r[1]]), [24, 76]);
doc.h2("Defence in Depth at the Distribution Point");
doc.p("The clearest example of defence in depth is the check made on each farmer. Four layers must all pass, and each catches an attack the others cannot:");
doc.numbered([
  "**Issuer signature.** Catches forged and edited credentials (T1).",
  "**Holder challenge–response (L2).** Catches screenshots, photocopies and replayed answers (S1).",
  "**Revocation and expiry.** Catches credentials that were valid but have been withdrawn (T2).",
  "**Human face check.** Catches a genuine phone held by the wrong person, and is the only holder check for paper wallets (L1).",
]);
doc.p(`Figure ${doc.peekFig()} shows the verifier's verdicts for a genuine holder and for three of these attacks, captured from the automated browser test TC-SYS-002 with the phone offline.`);
doc.figure("Verifier verdicts: genuine, replayed, edited and revoked credentials", "../screenshots/verifier-verdicts.png", 16);

// =====================================================================
doc.h1("Authentication and Authorisation Scheme");
doc.h2("Holders (Farmers), Offline");
doc.p("A farmer is authenticated at the distribution point without any network, by three factors: something they have (the device key in their wallet, proved by challenge–response), something they know (the six-digit PIN that unseals the key) and something they are (their face, checked by the agent against the photograph and name). The protocol is:");
doc.numbered([
  "The wallet shows its credential QR; the verifier checks the issuer signature, revocation and expiry.",
  "The verifier shows a challenge QR containing a fresh 128-bit random nonce and the credential ID.",
  "The farmer enters the PIN; the wallet unseals its key and signs the message [\"QRW1-CHALLENGE\", nonce, credential ID].",
  "The verifier checks the answer against the holder public key inside the signed credential. A nonce is accepted once only, so a recorded answer cannot be replayed.",
  "The agent compares the face with the photograph and records the verdict.",
]);
doc.p("Paper wallets (L1) cannot answer a challenge, so the face check is their only holder check. Every acceptance records its assurance level so that auditors can see how much L1 is used.");
doc.h2("Staff, Online");
doc.p("Officers, agents, auditors and administrators log in to the Auth service with a username and password. Passwords are hashed with scrypt; five failed attempts lock the account (HTTP 423) and the login endpoint is rate-limited to 20 requests per minute per client. Auth then issues a JSON Web Token signed with EdDSA (Ed25519) carrying the claims in QRW-SDD-02 Table 6.2. Staff tokens last eight hours; agent tokens last seven days so that a verifier can keep working offline. Every other service verifies tokens with Auth's public key and a fixed algorithm list, which defeats the \"alg: none\" and HS256 key-confusion attacks.");
doc.h2("Service to Service");
doc.p("The Issuer publishes revocation lists to Trust with a shared service key. Trust then re-verifies the Issuer's signature on the list, so a leaked service key alone cannot inject a forged list: at worst it could re-send a list the Issuer had already signed, and the anti-rollback check refuses older versions. In production this channel would use mutual TLS.");
doc.h2("Authorisation");
doc.p(`Authorisation is role-based. Each endpoint declares the roles allowed, as shown in Table ${doc.peekTable()}; separation of duties means no role can both issue credentials and audit verifications.`);
const roles = mdTable("**Role permissions:**").map((r) => r.map((c) => c.replace("✓", "Yes")));
doc.table("Role permissions", ["Operation", "Officer", "Agent", "Admin", "Auditor"], roles, [44, 14, 14, 14, 14]);
doc.h2("Cryptographic Choices");
doc.p(`The algorithms and parameters are listed in Table ${doc.peekTable()}. Only standard, widely reviewed primitives are used, from maintained libraries (Python cryptography and PyJWT; @noble/ed25519 and the browser's Web Crypto API).`);
doc.table("Cryptographic algorithms and parameters", ["Algorithm", "Used for", "Parameters", "Standard"], [
  ["Ed25519", "Credentials, revocation lists, challenge answers, staff tokens", "Strict verification in the browser (no ZIP-215 leniency)", "RFC 8032"],
  ["SHA-256", "Audit hash chain; issuer key IDs", "256-bit output", "FIPS 180-4"],
  ["HMAC-SHA256", "Keyed hash of the NIN", "256-bit secret pepper", "RFC 2104"],
  ["scrypt", "Staff passwords", "N = 2^14, r = 8, p = 1; 128-bit salt per user", "RFC 7914"],
  ["PBKDF2-SHA256 + AES-256-GCM", "Wallet PIN vault", "210,000 iterations; 128-bit salt; 96-bit IV", "RFC 8018; NIST SP 800-38D"],
  ["PKCS #8 encryption", "Issuer signing key at rest", "Best available encryption under a password", "RFC 5958"],
  ["CSPRNG", "Nonces, salts, credential and record IDs", "128-bit nonces", "Web Crypto; Python secrets"],
], [22, 30, 30, 18]);

// =====================================================================
doc.h1("Security Testing and Evidence");
doc.p(`Security was tested with five complementary techniques, summarised in Table ${doc.peekTable()}. Static analysis and dependency scanning run on every push in GitHub Actions, so a regression fails the build.`);
doc.table("Security testing performed", ["Technique", "Tool", "Result"], [
  ["Static analysis (SAST)", "Bandit, Flake8", "One low finding (B105 on the OAuth2 token type \"bearer\") triaged as a false positive; zero issues after triage"],
  ["Dependency scanning (SCA)", "pip-audit, npm audit", "Python clean. Web: react-router-dom advisories found; the dependency was removed, leaving zero runtime vulnerabilities"],
  ["Dynamic scanning (DAST)", "OWASP ZAP 2.16.1", "Before: 0 High, 1 Medium, 1 Low. One Medium fixed test-first. After: 0 High, 0 Medium, 1 Low accepted"],
  ["Security test cases", "pytest (black-box)", "24 cases, TC-SEC-001 to TC-SEC-012: all pass"],
  ["Property-based fuzzing", "Hypothesis", "Every single-bit flip of a credential is rejected; arbitrary QR text never crashes the decoder"],
], [24, 20, 56]);
doc.h2("Static Analysis");
doc.p("Bandit scanned the services and the core library. Its single finding, B105 (possible hard-coded password) on the string \"bearer\", is the OAuth2 token type defined in RFC 6750 and not a secret; it was marked as a reviewed false positive in the code with a comment explaining why. Bandit also flagged the use of subprocess with shell=True in a developer tool; that was fixed rather than suppressed. Before and after reports are kept in docs/evidence.");
doc.h2("Dependency Scanning");
doc.p("pip-audit found no known vulnerabilities in the Python dependencies. npm audit found open-redirect and cross-site scripting advisories in react-router-dom, which is shipped to phones. Upgrading removed the high-severity advisories but left two moderate ones fixable only in a breaking major version, so the dependency was replaced by a 50-line internal router that navigates only to six fixed paths. The runtime audit now reports zero vulnerabilities. Advisories remaining in development-only tools (Vite, Vitest) do not reach users and are scheduled as adaptive maintenance.");
doc.h2("Dynamic Scanning with OWASP ZAP");
doc.p("OWASP ZAP, the dynamic scanner named in the course, was run against all five running services. Each service's OpenAPI description was imported so that ZAP knew every endpoint, a valid token for a suitable role was attached to every request, and the full default active-scan policy was applied (SQL injection, cross-site scripting, path traversal, command injection, server-side request forgery and others); each scan sent about 6,860 requests. The scan script is in the repository (tools/zap_scan.py) so that it can be repeated.");
doc.p(`The first scan (Figure ${doc.peekFig()}) found no High-risk issues and one Medium: the interactive API documentation pages (/docs) had no Content-Security-Policy header. The API endpoints themselves already sent a strict policy, but the documentation pages had been exempted so that Swagger UI could load.`);
doc.figure("OWASP ZAP summary before the fix", "../evidence/zap/before/zap-summary.png", 14.5);
doc.p("The finding was fixed test-first. Two failing tests were written (TC-SEC-011 requires a strict policy on the documentation pages; TC-SEC-012 requires that the pages can be switched off), then the fix: the documentation pages now receive their own policy that allows scripts only from the service itself, the pinned CDN, or the page's own inline script identified by its SHA-256 hash, with no 'unsafe-inline' or 'unsafe-eval' and no framing; and setting QRW_API_DOCS=0 removes the pages and the OpenAPI description in production. A first version of the fix still allowed inline styles, and the re-scan raised a new Medium (rule 10055); inline styles were then removed after checking in a browser that Swagger UI still works without them. This loop of scan, test, fix and re-scan is the intended use of a DAST tool.");
doc.figure("OWASP ZAP summary after the fix", "../evidence/zap/after/zap-summary.png", 14.5);
doc.p(`The remaining alerts, all triaged, are listed in Table ${doc.peekTable()}. During the scan the login rate limiter returned HTTP 429 to ZAP's fuzzing of the login endpoint, which is the intended behaviour (NFR-S7).`);
doc.table("Remaining ZAP alerts and triage", ["Risk", "Alert", "Triage"], [
  ["Low", "Cross-domain JavaScript source file inclusion (10017), /docs pages", "Accepted: developer documentation page; CDN pinned in the policy; page switched off in production (TC-SEC-012)"],
  ["Info", "Authentication request identified (10111)", "Expected: the login endpoint"],
  ["Info", "Modern web application (10109)", "Informational only"],
  ["Info", "User agent fuzzer (10104)", "No behaviour change by user agent; no action"],
], [10, 42, 48]);
doc.h2("Security Test Cases");
doc.p(`The black-box security tests in Table ${doc.peekTable()} run against the services on every push. Several are parameterised over a list of attack strings, giving 24 executed cases.`);
doc.table("Security test cases", ["ID", "What it checks", "Result"], [
  ["TC-SEC-001", "SQL, template and script injection strings in the login form are rejected cleanly (6 payloads)", "Pass"],
  ["TC-SEC-002", "Injection strings and malformed NINs are refused by input validation (8 payloads)", "Pass"],
  ["TC-SEC-003", "Injection in audit query filters returns no rows and no error", "Pass"],
  ["TC-SEC-004", "Forged tokens are rejected: unsigned (alg none) and HS256 key-confusion attacks", "Pass"],
  ["TC-SEC-005", "Expired tokens are rejected", "Pass"],
  ["TC-SEC-006", "An agent cannot file records in another agent's name", "Pass"],
  ["TC-SEC-007", "Oversized photos, batches and fields are refused", "Pass"],
  ["TC-SEC-008", "Security headers present on every response", "Pass"],
  ["TC-SEC-009", "CORS allows only the web application's origin", "Pass"],
  ["TC-SEC-010", "Server errors never reveal stack traces or internals", "Pass"],
  ["TC-SEC-011", "API documentation pages carry a strict, hash-based CSP (ZAP finding)", "Pass"],
  ["TC-SEC-012", "API documentation can be switched off for production", "Pass"],
], [17, 71, 12]);
doc.p("Security behaviour is also covered by functional tests listed against each threat in Table 4.1, for example the replay test in TC-SYS-002 and the single-bit-flip property test TC-CORE-014.");

// =====================================================================
doc.h1("Residual Risks and Recommendations");
doc.p(`No system is free of risk. Table ${doc.peekTable()} lists what remains after the mitigations, with the control that limits each and the recommended next step; the first five are carried to the risk register (QRW-PRM-05).`);
doc.table("Residual risks", ["Residual risk", "Current control", "Recommendation"], [
  ["Revocation lag at offline points: a revoked credential can pass until the verifier next synchronises", "Seven-day warning and 30-day refusal on list age; credential expiry", "Delta lists that are small enough to sync over SMS or USSD"],
  ["Paper wallets (L1) rely on a human face check only", "Level recorded on every acceptance; auditors can monitor L1 use", "Prefer L2 wherever a smartphone is available; train agents"],
  ["Phone cache tampering by someone with an unlocked agent phone", "List-age rules; device screen lock", "Cache the signed list and re-verify it on every load"],
  ["Offline PIN guessing on a seized phone", "PBKDF2 slows guessing; five-attempt lock; revoke on reported loss", "Use the phone's hardware-backed key store where available"],
  ["Signing key compromise", "Key only in the Issuer, encrypted at rest", "Hardware security module; key rotation through key IDs"],
  ["Repudiation by a farmer (R2)", "Signed answer is verified but not stored", "Store the signed answer in the audit record"],
  ["Staff accounts protected by password only", "scrypt, lockout, rate limit, short token lifetime", "Add multi-factor authentication (deferred for time)"],
  ["Internal traffic not encrypted in the prototype", "Services on one host behind a single HTTPS origin", "Mutual TLS between services in production"],
], [32, 34, 34]);
doc.p("Two controls named in the course were consciously deferred. Multi-factor authentication for staff was cut from the schedule recovery plan because the staff threat is already bounded by lockout, rate limiting and short-lived tokens, while the offline holder threat, which has no such bounds, received the effort instead. Mutual TLS was deferred because every service runs on one host in the prototype; it is the first change needed for a multi-host deployment.");

doc.save(process.argv[2], [["1.0", "4 Nov 2026", "First complete security engineering report, including OWASP ZAP scan"]]).then(() => console.log("written", process.argv[2]));
