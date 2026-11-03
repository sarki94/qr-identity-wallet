"""Requirements catalogue: the single source for the SRS tables and the RTM.

Each entry: id, kind (FR/NFR), category, priority (MoSCoW), status, text,
uml (artefact from docs/uml), code (main module(s) that implement it).
Status is honest: Implemented, Partial (what is missing is stated) or Deferred.
"""

UC = "UC diagram (Fig. 4.1)"
SD1, SD2, SD3 = "SD-1 Issuance sequence (Fig. 4.2)", "SD-2 Offline verification sequence (Fig. 4.3)", "SD-3 Revocation & sync sequence (Fig. 4.4)"
CD, SM1, SM2 = "Class diagram (Fig. 4.5)", "SM-1 Verification state machine (Fig. 4.6)", "SM-2 Credential lifecycle (Fig. 4.7)"

REQUIREMENTS = [
    # Enrolment & issuance
    ("FR-01", "FR", "Enrolment", "M", "Implemented", "Officer looks up a farmer by NIN through NIMC before enrolment.", f"{UC} UC-01; {SD1}", "issuer/app.py enrol()"),
    ("FR-02", "FR", "Enrolment", "S", "Implemented", "Farmer photo captured and embedded as a small signed thumbnail.", f"{CD} Credential.photo", "web Portal.tsx photoToB64(); qrw_core.credential"),
    ("FR-03", "FR", "Issuance", "M", "Implemented", "Issuer signs a credential with ID, masked NIN, name, ward, LGA, state, dates, key ID, level and (L2) holder key.", f"{SD1}; {SM2}", "qrw_core.credential.issue_credential(); issuer/app.py issue()"),
    ("FR-04", "FR", "Issuance", "M", "Implemented", "L2: wallet generates a device key; officer binds its public key into the credential.", f"{SD1}; {SM2} PendingBinding", "web qrw.ts newHolderKey(); issuer/app.py issue()"),
    ("FR-05", "FR", "Issuance", "S", "Implemented", "L1: printable paper-wallet card with signed QR.", f"{UC} UC-04; {SM2}", "web Portal.tsx (print); qrw_core.credential"),
    ("FR-06", "FR", "Issuance", "M", "Implemented", "At most one active credential per NIN; re-issue revokes the old one atomically (D8).", f"{SD1} opt re-issue; {CD} rule 2", "issuer/app.py issue() single transaction"),
    ("FR-07", "FR", "Revocation", "M", "Implemented", "Officer revokes a credential with a recorded reason.", f"{SD3}; {SM2} Revoked", "issuer/app.py revoke()"),
    ("FR-08", "FR", "Trust", "M", "Implemented", "Trust service publishes issuer public keys with key IDs.", SD3, "trust/app.py keys()"),
    ("FR-09", "FR", "Trust", "M", "Implemented", "Signed, versioned revocation list; Trust verifies it and refuses rollback (D11).", f"{SD3}; {CD} RevocationList", "qrw_core.revocation; trust/app.py receive()"),
    # Wallet
    ("FR-10", "FR", "Wallet", "S", "Implemented", "Several farmer profiles on one shared phone, each with its own key and PIN.", f"{UC} UC-06", "web Wallet.tsx"),
    ("FR-11", "FR", "Wallet", "M", "Implemented", "Credential shown only after the profile PIN is entered.", f"{UC} UC-07", "web Wallet.tsx unlock(); vault.ts"),
    ("FR-12", "FR", "Wallet", "M", "Implemented", "Wallet signs (challenge + credential ID) with the device key and shows the answer QR.", f"{SD2}", "qrw_core.challenge.sign_challenge(); web qrw.ts signChallenge()"),
    ("FR-13", "FR", "Wallet", "M", "Implemented", "All wallet functions work with no network after enrolment.", f"{SD2}", "web Wallet.tsx (no API calls); PWA service worker"),
    # Verifier
    ("FR-14", "FR", "Verifier", "M", "Partial", "Agent logs in online once, then works offline for 7 days. (Agent PIN unlock not built: the 7-day token is kept on the phone.)", f"{UC} UC-11", "auth/app.py token(); web Verifier.tsx"),
    ("FR-15", "FR", "Verifier", "M", "Implemented", "Verifier downloads keys and revocation list when online and on demand, checking the list signature itself.", SD3, "web Verifier.tsx sync(); qrw.ts verifyRevocationList()"),
    ("FR-16", "FR", "Verifier", "M", "Implemented", "Verifier checks the issuer signature offline.", f"{SD2}; {SM1} CredentialRead", "qrw_core.credential.verify_credential(); web qrw.ts verifyCredential()"),
    ("FR-17", "FR", "Verifier", "M", "Implemented", "L2: fresh random challenge; wallet answer verified against the holder key.", f"{SD2}; {SM1} ChallengeShown", "qrw_core.challenge; web qrw.ts verifyChallengeResponse()"),
    ("FR-18", "FR", "Verifier", "M", "Implemented", "Verifier checks expiry and revocation against its cached list.", f"{SM1}", "qrw_core.credential.verify_credential()"),
    ("FR-19", "FR", "Verifier", "M", "Implemented", "Signed photo or details shown; agent must confirm the face before acceptance.", f"{SM1} AwaitingFaceCheck", "web Verifier.tsx face step"),
    ("FR-20", "FR", "Verifier", "M", "Implemented", "Verdict shown as Accepted (L2), Accepted (L1) or Rejected with reason.", SM1, "web Verifier.tsx"),
    ("FR-21", "FR", "Verifier", "M", "Implemented", "Warn when the list is older than 7 days; refuse acceptances after 30 days.", f"{SM1} guard", "web Verifier.tsx SOFT_DAYS/HARD_DAYS"),
    ("FR-22", "FR", "Verifier", "M", "Implemented", "Every attempt (accepted or rejected) recorded in a local queue.", f"{SM1} RecordQueued", "web Verifier.tsx finish()"),
    ("FR-23", "FR", "Verifier", "M", "Implemented", "No proxy or delegated presentation; the holder must be present (D6).", f"{SD2}", "qrw_core.challenge; Verifier face check"),
    # Audit
    ("FR-24", "FR", "Audit", "M", "Implemented", "Queued records uploaded in batches and appended to a hash chain; agent identity from the token.", SD3, "audit/app.py upload(); qrw_core.audit"),
    ("FR-25", "FR", "Audit", "M", "Implemented", "Auditor filters records and runs a chain-integrity check.", f"{UC} UC-13", "audit/app.py check_chain(); qrw_core.audit.verify_chain()"),
    ("FR-26", "FR", "Audit", "S", "Implemented", "Flag a credential accepted at two points within 24 hours (possible cloning).", f"{UC} UC-14", "audit/app.py anomalies()"),
    # Staff access
    ("FR-27", "FR", "Access", "M", "Partial", "Staff sign in with username and password. (TOTP MFA for Admin/Auditor deferred: cut list item 2.)", f"{UC} UC-11; {SD1}", "auth/app.py token()"),
    ("FR-28", "FR", "Access", "M", "Implemented", "Every endpoint enforces role-based access (Officer, Agent, Admin, Auditor).", CD, "shared/security.py require_roles()"),
    ("FR-29", "FR", "Access", "S", "Implemented", "Admin creates, disables, unlocks and assigns staff to distribution points.", f"{UC} UC-12", "auth/app.py users endpoints"),
    # NFR: performance
    ("NFR-P1", "NFR", "Performance", "M", "Implemented", "Offline verification (scan to verdict, excluding people) within 3 s on a low-end phone.", SD2, "qrw_core.credential; web qrw.ts"),
    ("NFR-P2", "NFR", "Performance", "M", "Implemented", "Credential issuance completes within 5 s.", SD1, "issuer/app.py issue()"),
    ("NFR-P3", "NFR", "Performance", "M", "Implemented", "Core verification available with zero connectivity; services degrade gracefully when one is down.", SD2, "web Verifier.tsx; issuer publish retry"),
    # NFR: security
    ("NFR-S1", "NFR", "Security", "M", "Implemented", "Ed25519 signing; issuer private key only in the Issuer, encrypted at rest (HSM in production).", CD, "qrw_core.keys; services/secrets.py"),
    ("NFR-S2", "NFR", "Security", "M", "Implemented", "Holder private keys sealed with a PIN-derived key (PBKDF2 + AES-GCM).", CD, "web vault.ts"),
    ("NFR-S3", "NFR", "Security", "M", "Partial", "TLS on all traffic. (Prototype: HTTPS between phones and the app; services on localhost behind the proxy. Production: TLS reverse proxy.)", "Deployment", "web vite.config.ts basicSsl"),
    ("NFR-S4", "NFR", "Security", "M", "Implemented", "Data minimisation: masked NIN only; full NIN never stored (keyed hash, D13).", CD, "qrw_core.credential.mask_nin(); issuer nin_hash()"),
    ("NFR-S5", "NFR", "Security", "M", "Implemented", "Fail securely: any error, unknown key or bad input is a rejection, never a crash or leak.", SM1, "verify_credential(); shared/app.py fail_safely()"),
    ("NFR-S6", "NFR", "Security", "M", "Implemented", "Audit records tamper-evident (hash chain).", CD, "qrw_core.audit"),
    ("NFR-S7", "NFR", "Security", "M", "Implemented", "Login rate-limited; account locks after 5 failed logins.", "-", "shared/security.py RateLimiter; auth lockout"),
    ("NFR-S8", "NFR", "Security", "M", "Partial", "Nigeria Data Protection Act 2023 principles. (Minimisation and purpose limitation built in; consent capture is a procedural step at enrolment.)", "-", "Design + procedure"),
    # NFR: usability
    ("NFR-U1", "NFR", "Usability", "S", "Partial", "Hausa and English. (Verdict strings in Hausa; full translation deferred.)", "-", "web Verifier.tsx"),
    ("NFR-U2", "NFR", "Usability", "M", "Implemented", "Verdicts readable without reading English: colour, icon, Hausa word.", SM1, "web Verifier.tsx; styles.css"),
    ("NFR-U3", "NFR", "Usability", "M", "Implemented", "An L2 verification takes at most 4 agent taps.", SD2, "web Verifier.tsx"),
    ("NFR-U4", "NFR", "Usability", "M", "Implemented", "Usable on 5-inch screens; touch targets at least 48 px.", "-", "web styles.css .btn min-height 48px"),
    # NFR: capacity
    ("NFR-C1", "NFR", "Capacity", "M", "Implemented", "Credential QR at most 1,800 bytes, including a photo thumbnail.", CD, "qrw_core.qr"),
    ("NFR-C2", "NFR", "Capacity", "S", "Implemented", "Wallet stores up to 5 profiles in at most 5 MB.", "-", "web Wallet.tsx; vault.ts"),
    ("NFR-C3", "NFR", "Capacity", "M", "Implemented", "Revocation list of 100,000 entries transferred and cached in at most 2 MB (compressed). First test failed at 2.40 MB uncompressed; fixed with gzip in transit and deflate in the phone cache.", SD3, "shared/app.py GZipMiddleware; web qrw.ts packIds()"),
    ("NFR-C4", "NFR", "Capacity", "M", "Implemented", "At least 2,000 queued records per upload.", SD3, "audit/app.py MAX_BATCH"),
]

# Requirements verified by inspection or demonstration rather than an automated test.
MANUAL = {
    "FR-19": "Demo: Verifier face-check step (TC-SYS-002 screenshot 08)",
    "FR-20": "Demo: TC-SYS-002 screenshots 09-13",
    "FR-21": "Demo: Verifier demo clock +8 / +31 days",
    "NFR-S8": "Inspection: data fields in credential and Issuer DB",
    "NFR-U1": "Inspection: Verifier verdict strings",
    "NFR-U2": "Inspection: TC-SYS-002 screenshots 09-10",
    "NFR-U3": "Demo: count taps in TC-SYS-002 flow (scan, scan answer, Yes)",
    "NFR-U4": "Inspection: styles.css",
    "NFR-S3": "Inspection: npm run phone serves HTTPS",
}
