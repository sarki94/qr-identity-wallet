# Security Engineering

Offline-First Cryptographic QR Identity Wallet · COEN838 Question 4

This document covers the threat model (STRIDE), the secure-design principles applied, the authentication and authorisation scheme, and the evidence from security testing. Every mitigation names the test case that verifies it; the test IDs match `docs/rtm.md`.

## 1. Assets and trust boundaries

**Assets, most valuable first:**
1. The **issuer signing key** (Ed25519). Whoever holds it can create identities.
2. **Holder device keys**, one per wallet profile. These prove "this is the real Musa".
3. The **revocation list**. A forged or stale list lets revoked credentials pass.
4. **Audit records**: the evidence of who was verified, where, and with what result.
5. **Personal data**: NIN, name, ward and photo.
6. **Staff accounts and tokens**.

**Trust boundaries** (see Figure 4.4 and the architecture diagram):

| Boundary | Between | Crossing protected by |
|---|---|---|
| B1 | Farmer's wallet ↔ agent's verifier (offline, QR) | Issuer signature, holder challenge–response, face check |
| B2 | Staff browsers ↔ services | Staff login, EdDSA JWT, role checks, HTTPS (phones) |
| B3 | Issuer → Trust (internal publish) | Service key; Trust re-verifies the list signature |
| B4 | Verifier ↔ Trust / Audit (async sync) | Verifier checks list signature itself; Audit takes identity from the token |
| B5 | Issuer → Mock NIMC | Internal network only (production: NIMC-issued credentials, mutual TLS) |
| B6 | Each service ↔ its own database | Database per service; no service reads another's data |

## 2. STRIDE threat model

Format: the lecturer's STRIDE table (Threat Category | Security Property Violated | Definition | Mitigation), applied to this system. *Definition* states the concrete threat here.

| Threat Category | Security Property Violated | Definition (threat in this system) | Mitigation (and verifying tests) |
|---|---|---|---|
| **S**poofing | Authentication | **S1.** An impostor presents another farmer's credential: a screenshot, photocopy or borrowed phone (the proxy collection observed in Kura, F1). | L2: offline **challenge–response**. The wallet signs a fresh 128-bit nonce + credential ID with a device key that never leaves the phone. **PIN** unlocks the key; the agent's **face check** comes last. *TC-CORE-031, -032, -033, TC-WEB-007, TC-SYS-002 (replay rejected), TC-SYS-003 step 10.* |
| Spoofing | Authentication | **S2.** An attacker forges a staff token or guesses a password to act as an officer or admin. | Passwords hashed with **scrypt**; **EdDSA-signed JWTs** with a fixed algorithm list (rejects `alg: none` and HS256 key confusion); **5-attempt lockout**; **rate limit** on login. *TC-SEC-004, -005, TC-SVC-012, -013, -016.* |
| Spoofing | Authentication | **S3.** A fake "issuer" or fake revocation list is fed to a verifier. | Verifiers trust only keys from the Trust service and **verify the list signature themselves** before caching it. *TC-WEB-008, TC-CORE-042, TC-SVC-025.* |
| Spoofing | Authentication | **S4.** Someone uses a lost or stolen agent phone while its 7-day offline token is still valid. | Token limited to the **Agent role and one distribution point**; every check is still recorded under that agent and **anomalies are flagged** (FR-26); device screen lock; the administrator disables the account so it cannot sign in again. (Residual: the token itself stays valid until it expires, and there is no agent PIN on the phone yet, FR-14 partial.) *TC-SVC-014, TC-SVC-033, TC-SEC-006.* |
| **T**ampering | Integrity | **T1.** Someone edits a credential (for example the name) to collect someone else's fertiliser. | **Ed25519 signature over the exact payload bytes**; the verifier checks the signature before reading any field. *TC-CORE-013, TC-CORE-014 (every single-bit flip rejected), TC-WEB-003, TC-SYS-002.* |
| Tampering | Integrity | **T2.** Someone removes an entry from the revocation list, or serves an older list (rollback). | List is **signed by the Issuer**; Trust **verifies and refuses rollback**; the verifier also refuses an older version. *TC-CORE-041, TC-SVC-025, TC-WEB-008.* |
| Tampering | Integrity | **T3.** An insider edits or deletes audit records in the database, and may recompute the chain to hide it. | **SHA-256 hash chain** (each record stores the previous record's hash) **plus an Ed25519 signature on every record hash** by the Audit service, whose key is held outside the database: an edit cannot be hidden by recomputing the chain. *TC-CORE-051, -052, -053, TC-SVC-031, TC-SVC-034, -035.* |
| **R**epudiation | Non-repudiation | **R1.** An agent denies a verification, or files records in another agent's name. | Agent and point are taken **from the signed token**, never the request body; every attempt is recorded and hash-chained. *TC-SEC-006, TC-SVC-030, TC-SVC-031.* |
| Repudiation | Non-repudiation | **R2.** A farmer denies having presented the credential. | The wallet's answer is a **digital signature** over the nonce and credential ID. (Residual: the prototype records the result, not the signed answer; storing it is a planned perfective change.) *TC-CORE-030.* |
| **I**nformation disclosure | Confidentiality | **I1.** The QR (seen by every agent) exposes personal data. | **Data minimisation**: masked NIN (123\*\*\*\*\*901), no BVN, phone number or date of birth. *TC-CORE-018, TC-SVC-020.* |
| Information disclosure | Confidentiality | **I2.** A stolen Issuer database reveals NINs. | Full NIN **never stored**: HMAC-SHA256 keyed hash (secret pepper) plus masked copy (D13). *TC-SVC-020.* |
| Information disclosure | Confidentiality | **I3.** A stolen or shared phone reveals another family member's key. | Each profile's key is **sealed with its own PIN** (PBKDF2 210k + AES-GCM); 5 wrong PINs lock the profile; the credential can be revoked. *TC-WEB-014.* |
| Information disclosure | Confidentiality | **I4.** Error messages reveal internals; responses are cached or framed by other sites. | Generic error handler (no stack traces); `nosniff`, `X-Frame-Options: DENY`, `no-store`, strict CSP on every response; CORS limited to the app's origin. *TC-SEC-008, -009, -010.* |
| **D**enial of service | Availability | **D1.** No network at the distribution point (the exam's problem statement). | **Offline-first**: verification needs no server; records queue locally. *TC-SYS-002, TC-SYS-003 steps 6–11.* |
| Denial of service | Availability | **D2.** Login flooding or password guessing. | Rate limit (20/min per client) and lockout. *TC-SVC-016, TC-SVC-012.* |
| Denial of service | Availability | **D3.** Oversized uploads or a "decompression bomb" QR exhaust memory. | 8 KB inflate cap on QR payloads; 2,000-record batch cap; field length limits. *TC-CORE-024, TC-SEC-007.* |
| Denial of service | Availability | **D4.** The Trust service is down. | Verifiers keep their cached list; the Issuer retries publishing. *TC-SVC-026.* |
| **E**levation of privilege | Authorization | **E1.** An agent calls officer or admin functions. | **Role check on every endpoint** (least privilege). *TC-SVC-014.* |
| Elevation of privilege | Authorization | **E2.** A compromised Trust or Audit service gains the power to create identities or tokens. | Signing key only in the Issuer (D11); services hold only **public** keys to check tokens (D12); Trust can publish but not sign. *TC-SVC-025.* |
| Elevation of privilege | Authorization | **E3.** Injection (SQL, template, script) through inputs. | Parameterised queries (SQLAlchemy), strict Pydantic validation (e.g. NIN must be 11 digits). *TC-SEC-001, -002, -003.* |

## 3. Secure-design principles applied

| Principle | Where it is applied |
|---|---|
| **Least privilege** | Only the Issuer reads the signing key. Services verify tokens with Auth's public key and cannot mint them. Each role reaches only its own endpoints. Verifiers can check credentials but never create them. |
| **Defence in depth** | A credential must pass four independent layers: issuer signature, holder challenge, revocation/expiry, and the human face check. The revocation list is verified by Trust *and* again by each verifier. |
| **Fail securely** | Every unknown, malformed or expired input is rejected, never accepted or crashed on (property-tested over random input, TC-CORE-019, -023). Unreadable phone cache forces a fresh sync. Server errors return a generic message. |
| **Minimise attack surface** | No message broker or extra infrastructure; the web app's router dependency was removed when audited (see `evidence/dependency-audit.md`); credentials carry only what a distribution point needs. |
| **Separation of duties** | Officers issue and revoke; agents verify; auditors read logs; admins manage accounts. No role can both issue and audit. |
| **Secure by default** | Demo accounts can be switched off (`QRW_SEED_DEMO=0`); keys are generated encrypted; CORS defaults to the app's own origin. |
| **Economy of mechanism** | One signature scheme (Ed25519) and one hash (SHA-256) everywhere; the verifier logic is a small pure function, tested in both Python and the browser against the same vectors. |

## 4. Authentication and authorisation scheme

**Farmers (holders), offline:** possession of the device key (proved by challenge–response), knowledge of the PIN (unseals the key), and a human check of the face against the credential. Paper wallets (L1) have only the face check, which is why every acceptance records its level.

**Staff (officers, agents, auditors, admins), online:**
1. `POST /token` with username and password → scrypt check → lockout after 5 failures.
2. Auth issues a **JWT signed with EdDSA (Ed25519)**: claims `sub`, `role`, `pt` (distribution point), `iss`, `exp`. Staff tokens last 8 hours; agent tokens last 7 days so verifiers can work offline (FR-14).
3. Every other service verifies the token with Auth's **public** key and enforces the role.

**Service to service:** the Issuer publishes revocation lists to Trust with a shared service key; Trust then re-checks the Issuer's signature, so a leaked service key alone cannot inject a forged list. Production would use mutual TLS, as listed in the lecturer's mitigations.

**Role permissions:**

| Operation | Officer | Agent | Admin | Auditor |
|---|:-:|:-:|:-:|:-:|
| Enrol farmer, issue, revoke | ✓ | | | |
| Republish revocation list | ✓ | | ✓ | |
| View farmer's credentials | ✓ | | ✓ | |
| Upload verification records | | ✓ | | |
| Read records, check chain, anomalies | | | ✓ | ✓ |
| Create / disable / unlock staff | | | ✓ | |
| Public keys and revocation list | open | open | open | open |

## 5. Security testing performed

| Technique | Tool | Result | Evidence |
|---|---|---|---|
| SAST | Bandit | 1 low finding (B105, `"bearer"` token type) triaged as false positive; 0 issues after triage | `evidence/bandit-services-*.txt`, CI |
| Linting | Flake8 | Clean | CI |
| Dependency scanning (SCA) | pip-audit, npm audit | Python clean. Web: react-router-dom open-redirect advisories found → dependency removed → 0 runtime vulnerabilities | `evidence/dependency-audit.md` |
| DAST-style black-box tests | pytest against running services | 24 cases: injection, JWT forgery, expiry, spoofing, oversize, headers, CORS, error leakage, docs-page CSP. All pass | `services/tests/test_security.py` |
| Property-based fuzzing | Hypothesis | Every single-bit flip rejected; arbitrary QR text never crashes the decoder | `core/tests/test_credential.py`, `test_qr.py` |
| Cross-implementation | Vitest + Python vectors | Browser verifier and Python issuer agree byte for byte | `web/tests/qrw.test.ts` |
| DAST scan | OWASP ZAP 2.16.1 (OpenAPI import, authenticated, full active scan) | Before: 0 High, 1 Medium (no CSP on `/docs`), 1 Low. Fixed test-first (TC-SEC-011, -012). After: 0 High, 0 Medium, 1 Low accepted | `evidence/zap/README.md`, `tools/zap_scan.py` |

## 6. Residual risks (carried to the risk register)

1. **Revocation lag at offline points** (demonstrated in the Guided Demo, step 13): limited by credential expiry, the 7-day warning and 30-day refusal.
2. **L1 paper wallets** rely on a human face check only.
3. **Phone cache tampering**: a person with an unlocked agent phone could clear its cached list; mitigated by the list-age rules and device screen lock. A planned improvement is to cache the signed list and re-verify it on load.
4. **PIN brute force on a seized phone**: 6 digits and PBKDF2 slow an offline attack but do not stop it, and the five-attempt lock does not protect data copied off the phone; revocation on reported loss is the control, and hardware-backed key storage is the planned fix.
5. **Signing key at rest**: encrypted file in the prototype; production needs a hardware security module (HSM).
6. **Stolen agent phone within the 7-day token lifetime** (S4): checks can be made in that agent's name until the token expires. Planned: agent PIN unlock (FR-14) and a token deny-list checked at sync.
