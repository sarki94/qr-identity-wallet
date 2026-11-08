// Technical Report QRW-TR-07: a software project technical report (not a thesis).
// Layout: report title page with details and abstract; contents; continuous numbered sections;
// findings in tables; issues, open items and recommendations; appendices.
const { Doc } = require("./lib");
const UML = process.env.UML_PNG;

const doc = new Doc({
  code: "QRW-TR-07", title: "Technical Report", version: "1.4", date: "8 November 2026", layout: "report", continuous: true,
  reportTitle: "Offline-First Cryptographic QR Identity Wallet for Rural Public Services",
  reportSubtitle: "Technical report on the engineering of the solution to COEN838 Question 4",
  details: [
    ["Report number", "QRW-TR-07, version 1.4"],
    ["Date", "8 November 2026"],
    ["Prepared by", "Aliyu Sarki Iliyasu"],
    ["Registration number", "P25EGCP8040"],
    ["Programme", "MSc Computer Engineering"],
    ["Course", "COEN838 Advanced Software Engineering, project examination, Question 4"],
    ["Institution", "Department of Computer Engineering, Ahmadu Bello University, Zaria"],
    ["Source code", "https://github.com/sarki94/qr-identity-wallet"],
    ["Companion documents", "QRW-SRS-01, QRW-SDD-02, QRW-SEC-03, QRW-TST-04, QRW-PRM-05, QRW-USR-06"],
  ],
  abstract: "Rural citizens in Nigeria are often refused public services because online NIN verification fails where there is no network. This report describes the engineering of an offline-first cryptographic QR identity wallet, applied to the collection of subsidised fertiliser in Kura LGA, Kano State. A farmer receives an Ed25519-signed credential held in a phone wallet or printed on paper; the agent's phone verifies it with no network by checking the signature, a challenge–response that proves the wallet is not a copy, a cached signed revocation list and a face check, and later uploads each record to a hash-chained audit log. The prototype (core library, five services, one progressive web app) meets 43 of 48 requirements in full and 5 in part; 98 automated test cases pass; and the final security scan has no high- or medium-risk finding. The report states the assumptions made, the process followed, the results, the issues met and the work that remains.",
  keywords: "offline-first, digital identity, Ed25519, QR code, revocation, STRIDE, test-driven development",
});

// =====================================================================
doc.h1("Executive Summary");
doc.p("The task was to engineer, with the methods of Modules I to V, a working solution to the problem that online identity checks fail in rural Nigeria. The delivered system moves the trust decision from the server to the agent's phone: credentials are signed once, online, at the LGA office, and verified anywhere, offline, in milliseconds. Revocation and audit synchronise whenever a signal is available. Table " + doc.peekTable() + " gives the outcome at a glance.");
doc.table("Outcome at a glance", ["Area", "Outcome"], [
  ["Working software", "Core library, five services and a progressive web app; runs on one laptop with one launcher, or on phones over HTTPS"],
  ["Requirements", "48 requirements: 43 implemented, 5 partial; all traced to tests or manual verification"],
  ["Testing", "98 test cases, 149 checks, all passing; coverage 97% (core), 97% (services)"],
  ["Security", "20 STRIDE threats mitigated; audit records signed; OWASP ZAP: 0 High, 0 Medium after fix; no open static-analysis or dependency findings"],
  ["Schedule", "Schedule performance index 0.94 at submission, after recovering from 0.25 on 2 November"],
  ["Open items", "Five partial requirements and production hardening (Section 9)"],
], [22, 78]);

// =====================================================================
doc.h1("Project Overview");
doc.h2("Problem Statement");
doc.p("The examination states the problem as follows: *\"Rural citizens in Nigeria often cannot access public services (e.g., local clinics, agricultural subsidies) because online NIN/BVN verification fails due to poor network connectivity.\"*");
doc.h2("Objectives");
doc.table("Project objectives and status", ["ID", "Objective", "Status"], [
  ["O1", "Verify a citizen's identity at the point of service with no network", "Met"],
  ["O2", "Prevent forged, altered and copied credentials from being accepted", "Met"],
  ["O3", "Allow credentials to be withdrawn, reaching offline points as soon as they sync", "Met, with a bounded delay"],
  ["O4", "Keep a tamper-evident record of every verification", "Met"],
  ["O5", "Include citizens with shared phones or no smartphone", "Met"],
  ["O6", "Protect personal data in line with the Nigeria Data Protection Act 2023", "Met in design; procedures for rollout"],
  ["O7", "Produce the artefacts and evidence required by the examination", "Met"],
], [8, 66, 26]);
doc.h2("Scope");
doc.table("Scope", ["In scope", "Out of scope"], [
  ["Enrolment against NIN (mock NIMC) and credential issuance", "Entitlement: quantities and whether a farmer has already collected (Question 3)"],
  ["Smartphone wallet (L2) and paper wallet (L1)", "BVN or any banking data"],
  ["Offline verification, revocation, synchronisation and audit", "Biometric matching by software"],
  ["Staff authentication and role-based access", "Native app-store apps; real NIMC integration"],
], [50, 50]);
doc.h2("Deliverables");
doc.table("Deliverables", ["Item", "Where"], [
  ["Running source code and build instructions", "GitHub repository; README; QRW-USR-06"],
  ["Software Requirements Specification with UML and RTM", "QRW-SRS-01"],
  ["Design documentation (architecture, ERD, communication, scalability)", "QRW-SDD-02"],
  ["Threat model, secure design and security testing", "QRW-SEC-03"],
  ["Test strategy, test cases and results", "QRW-TST-04"],
  ["Risk register, maintenance plan and delivery metrics", "QRW-PRM-05"],
  ["User manual and installation guide", "QRW-USR-06"],
  ["Technical report (this document)", "QRW-TR-07"],
], [62, 38]);

// =====================================================================
doc.h1("Assumptions");
doc.p("Instruction D of the examination requires every assumption made in interpreting the problem to be stated. Table " + doc.peekTable() + " gives the interpretation of the problem; Table " + doc.section + "." + ((doc.tableNo[doc.section] || 0) + 2) + " gives the operating assumptions the design relies on, including domain invariants that are easy to leave unstated because they seem obvious, such as the phone's clock being right (AS9).");
doc.table("Assumptions in interpreting the problem", ["ID", "Assumption", "Reason"], [
  ["IA1", "\"Rural public services\" is addressed through one concrete service, the collection of subsidised fertiliser; clinic attendance is a secondary case using the same mechanism.", "Both are named in the problem; a concrete case gives testable requirements and matches the author's own observation."],
  ["IA2", "\"Offline-first\" applies to verification at the point of service. Enrolment and issuance happen online at an LGA office.", "Issuance needs NIMC and must protect the signing key, which is unsafe on a field device."],
  ["IA3", "The credential proves identity only, not entitlement.", "Entitlement is the subject of Question 3; separation keeps the identity layer reusable."],
  ["IA4", "BVN is not used.", "Identity is anchored on the NIN; banking data in a QR seen by every agent breaches data minimisation."],
  ["IA5", "\"Wallet\" means a holder-controlled phone app; a printed paper wallet extends it to farmers without smartphones.", "The problem names a wallet; elicitation found shared and feature phones common."],
  ["IA6", "A progressive web app is acceptable as the app.", "It works offline, installs to the home screen and uses the camera without app-store distribution."],
  ["IA7", "Fictional NIMC records and demonstration accounts are acceptable for an examination prototype.", "Real NIMC access is licensed; no real personal data was used."],
], [8, 50, 42]);
doc.table("Operating assumptions", ["ID", "Assumption", "Consequence if false"], [
  ["AS1", "NIMC is represented by a mock service; production integration requires NIMC licensing.", "The Issuer calls the real interface; credentials and verifiers are unchanged."],
  ["AS2", "The issuer key is an encrypted file in the prototype; production uses a hardware security module.", "Higher key-compromise risk (PD-2)."],
  ["AS3", "L2 holders have an Android phone (own or shared) with a camera; others use the L1 paper wallet.", "More L1 use, lower assurance."],
  ["AS4", "Agents are given an Android smartphone by the programme.", "Verification cannot run at that point."],
  ["AS5", "Distribution points get at least intermittent connectivity within seven days.", "Revocations arrive later; the 30-day refusal applies."],
  ["AS6", "Entitlement is managed by a separate programme system.", "Scope would extend into Question 3."],
  ["AS7", "Proxy collection is prohibited by programme policy, as observed in Kura.", "A delegation feature would be needed."],
  ["AS8", "Enrolment takes place at an office with connectivity.", "Offline issuance would need a different key-protection design."],
  ["AS9", "The agent's phone shows the correct date (to within a day); expiry and list-age checks use the phone's clock.", "An expired credential or stale list could pass if the clock is set back; planned fix: check against server time at sync."],
], [8, 54, 38]);

// =====================================================================
doc.h1("Engineering Approach");
doc.h2("Development Methodology");
doc.p("An iterative, Agile-style process was used, adapted to a solo developer and a fixed deadline: requirements and models first, then daily increments that each ended in a tested build, with a written sprint plan, an agreed scope cut list, daily earned-value tracking and a decision log. The security-critical core was built test-first. Waterfall was rejected because problems with how the browser and the server agree on signatures had to surface on the day they appeared, not at the end.");
doc.h2("Version Control and Continuous Integration");
doc.p("All code, UML sources, requirements, evidence and document generators are kept in one Git repository on GitHub, so every change to a specification or to the code is tracked and can be traced to its commit. Commits use a conventional prefix (feat, fix, test, docs) and test-first work shows as a failing-test commit followed by the implementation. Every push runs the GitHub Actions pipeline: linting, static analysis, dependency audits, all automated tests with coverage gates of 90%, the web build and the Docker image build. A change that breaks any of these is marked failed before it can be relied on.");
doc.h2("Phases and Timeline");
doc.table("Phases and timeline", ["Date", "Phase", "Output"], [
  ["22 Oct 2026", "Inception", "Question chosen (D1); course formats collected from the lecture notes; service split (D3)"],
  ["25 Oct 2026", "Requirements and modelling", "Elicitation localised to Kura LGA; two assurance levels (D2a); UML models"],
  ["30 Oct 2026", "Design and core", "Credential format (D9); test strategy (D10); core library test-first; CI"],
  ["3 Nov 2026", "Construction", "Five services; web app; security tests; generated RTM; repository on GitHub, CI green"],
  ["4 Nov 2026", "Verification and documentation", "OWASP ZAP scan and fix; coverage; SRS, design, security, test, project and user documents"],
  ["5–8 Nov 2026", "Transition", "Review, slides, rehearsal and submission"],
], [16, 26, 58]);
doc.h2("Standards and Conventions Followed");
doc.table("Standards and conventions", ["Area", "Standard or convention"], [
  ["Requirements", "Lecturer's six-section SRS; FR/NFR classification; MoSCoW; four-column RTM"],
  ["Design", "IEEE 1016 viewpoints; UML 2 (use case, sequence, class, state machine)"],
  ["Security", "STRIDE in the lecturer's four-column format; OWASP Top 10; NDPA 2023"],
  ["Testing", "IEEE 829 test plan and summary report; test IDs tagged with requirement IDs"],
  ["Cryptography and encoding", "RFC 8032 (Ed25519), RFC 9285 (Base45), RFC 7914 (scrypt), RFC 8018 (PBKDF2)"],
  ["Code and documents", "PEP 8 (Flake8); TypeScript strict mode; Git with descriptive commits; department writing style"],
], [24, 76]);
doc.h2("Toolchain");
doc.table("Tools used", ["Purpose", "Tools"], [
  ["Modelling", "PlantUML (sources in the repository)"],
  ["Implementation", "Python, FastAPI, SQLAlchemy, cryptography, PyJWT; React, TypeScript, Vite, @noble/ed25519"],
  ["Testing", "pytest, Hypothesis, Vitest, Playwright"],
  ["Quality and security", "Flake8, Bandit, pip-audit, npm audit, OWASP ZAP"],
  ["Build, CI and delivery", "Git, GitHub, GitHub Actions, Docker Compose"],
  ["Documentation", "Scripts that generate the RTM, test catalogue, charts and all seven Word documents from the repository"],
], [24, 76]);

// =====================================================================
doc.h1("Solution Delivered");
doc.h2("System Overview");
doc.p(`Figure ${doc.peekFig()} shows the components. The Issuer is the only holder of the signing key; Trust publishes keys and the signed revocation list; Audit collects records into a hash chain; Auth issues staff tokens. Wallet and Verifier talk to each other only through QR codes, with no network.`);
doc.figure("Components of the delivered system", `${UML}/AR1.png`, 15.5);
doc.h2("Key Technical Decisions");
doc.table("Key technical decisions", ["ID", "Decision", "Rationale"], [
  ["D2a", "Two assurance levels on one credential format: L2 phone wallet, L1 paper wallet", "Shared and feature phones are common (elicitation)"],
  ["D3", "Services split on trust boundaries: Auth, Issuer, Trust, Audit, mock NIMC", "Signing key isolated in one service"],
  ["D6", "No proxy presentation", "Programme policy observed in Kura"],
  ["D8", "Atomic re-issue in one transaction", "Never two active credentials, nor none"],
  ["D9", "Sign exact payload bytes; QR = \"QRW1:\" + Base45(zlib(signature ‖ payload))", "No cross-language mismatch; compact QR"],
  ["D11", "Issuer signs the revocation list; Trust only verifies and publishes it", "Trust cannot forge or roll back a list"],
  ["D12", "Database per service; EdDSA staff tokens verified with Auth's public key", "Services check tokens but cannot mint them"],
  ["D13", "NIN stored as a keyed hash plus masked copy", "A stolen database reveals no NIN"],
  ["D14", "Strict RFC 8032 in the browser; one HTTPS origin for phones", "Browser and server accept the same signatures"],
], [8, 52, 40]);
doc.h2("Code Base");
doc.table("Code base summary", ["Part", "Technology", "Content"], [
  ["qrw_core", "Python", "Signing, verification, QR format, challenge–response, revocation list, hash chain"],
  ["Services", "FastAPI, SQLite / PostgreSQL", "Auth, Issuer, Trust and Revocation, Audit and Sync, mock NIMC; Docker image"],
  ["Web app", "React, TypeScript", "Wallet, Verifier, Issuer Portal, Audit, Guided Demo; works offline"],
  ["Size and history", "", "About 2,400 lines of production code; version history from 30 October 2026 with test-first commits"],
], [16, 26, 58]);

// =====================================================================
doc.h1("Engineering Work by Rubric Area");
doc.p("Table " + doc.peekTable() + " summarises what was done in each area of the marking rubric and where the evidence is.");
doc.table("Work performed and evidence", ["Area", "Work performed", "Evidence"], [
  ["Requirements and traceability (Module I)", "Ethnographic elicitation (non-participant observation in Kura LGA, 2024 wet season) triangulated with published sources; 29 FR and 19 NFR with MoSCoW priorities; use-case, sequence, class and state models; RTM generated from test tags", "QRW-SRS-01, Appendix A"],
  ["Architecture and design (Module III)", "Offline-first edge verification with a service-oriented back end; four styles compared; ERD with database per service; synchronous, asynchronous and offline patterns justified; scalability and failure modes analysed", "QRW-SDD-02"],
  ["Security engineering (Module IV)", "STRIDE on six trust boundaries (20 threats); least privilege, defence in depth, fail securely; offline holder authentication and staff RBAC; SAST, dependency scans, security tests, OWASP ZAP", "QRW-SEC-03"],
  ["Implementation", "Working core, services and web app; one-click launcher; Docker; phone mode over HTTPS", "Repository; QRW-USR-06"],
  ["Testing and QA (Module II)", "TDD with red–green commits; property-based, cross-implementation, integration, security and browser system tests; CI with coverage gates", "QRW-TST-04"],
  ["Project and risk management (Module V)", "Sprint plan and cut list; earned value; burndown; technical debt ratio; risk register (RE = P × L); maintenance plan by class", "QRW-PRM-05"],
], [22, 58, 20]);

// =====================================================================
doc.h1("Verification and Results");
doc.h2("Requirements Status");
doc.p("43 requirements are implemented in full. Table " + doc.peekTable() + " lists the five that are partial and what is missing.");
doc.table("Partially met requirements", ["Requirement", "Missing part"], [
  ["FR-14", "Agent PIN unlock of the seven-day offline token"],
  ["FR-27", "Multi-factor authentication for staff (cut from the schedule)"],
  ["NFR-S3", "TLS between services (prototype runs them on one host)"],
  ["NFR-S8", "Organisational procedures: recorded consent, impact assessment"],
  ["NFR-U1", "Full Hausa interface (verdicts only are in Hausa)"],
], [20, 80]);
doc.h2("Test Results");
doc.table("Test results", ["Measure", "Result"], [
  ["Automated test cases / checks", "98 / 149, all passing"],
  ["Browser system tests", "TC-SYS-002 11/11; TC-SYS-003 16/16 (re-run 8 November)"],
  ["Statement coverage", "Core 97%; services 97%; browser verifier 90%; PIN vault 100%"],
  ["Defects found / open", "8 / 0"],
], [40, 60]);
doc.h2("Non-Functional Targets");
doc.table("Measured against targets", ["Requirement", "Target", "Measured"], [
  ["NFR-P1 offline verification", "≤ 3 s", "0.32 ms (Python); 4.3 ms (browser library)"],
  ["NFR-P2 issuance", "≤ 5 s", "8 ms"],
  ["NFR-C3 100,000-entry revocation list", "≤ 2 MB", "0.94 MB in transit; 1.41 MB on the phone"],
  ["NFR-C2 five wallet profiles", "≤ 5 MB", "3.4 KB"],
  ["NFR-C4 daily records upload", "2,000 in one request", "Accepted; chain intact"],
], [36, 22, 42]);
doc.h2("Security Results");
doc.table("Security results", ["Check", "Result"], [
  ["Bandit (SAST)", "0 open; one false positive triaged, one finding fixed"],
  ["pip-audit / npm audit", "0 known vulnerabilities in shipped packages"],
  ["Security test cases", "24 checks (TC-SEC-001 to 012), all passing"],
  ["Audit log integrity", "Signed record hashes: a rewritten and recomputed chain is detected (TC-SVC-034)"],
  ["OWASP ZAP (authenticated, full active scan)", "Before: 1 Medium. After fix: 0 High, 0 Medium, 1 Low accepted"],
], [40, 60]);
doc.h2("Demonstration Readiness");
doc.p("The working software was tested through its web interface. The Guided Demo runs the whole distribution day on one laptop against the live services, and the candidate ran it end to end on his own Windows laptop; the automated browser system tests drive the same screens, including verification with the agent device offline.");

// =====================================================================
doc.h1("Issues and Resolutions");
doc.p("Table " + doc.peekTable() + " records the significant issues met during the project and how each was resolved.");
doc.table("Issues log", ["ID", "Issue", "Impact", "Resolution"], [
  ["IS-1", "Three planned days with no sprint work (SPI 0.25 on 2 Nov)", "Deadline risk", "Re-plan, work pulled forward, cut list applied; SPI 1.02 on 4 Nov"],
  ["IS-2", "Python packages would not install on the candidate's Windows laptop", "Setup blocked", "Corrected install paths and a fallback; README and manual updated"],
  ["IS-3", "Services not running during manual testing gave confusing errors", "Demo risk", "One-click launcher and the Guided Demo"],
  ["IS-4", "Valid QR codes rejected because the scanner trimmed meaningful spaces (DEF-01)", "Genuine farmers refused", "Fixed; clearer messages per code type; regression tests"],
  ["IS-5", "100,000-entry revocation list 2.40 MB, over budget (DEF-02)", "Capacity target missed", "Compression in transit and on the phone"],
  ["IS-6", "Advisories in a web routing dependency (DEF-03)", "Security", "Dependency removed; internal router"],
  ["IS-7", "No Content-Security-Policy on API documentation pages (DEF-04, DEF-05)", "Security", "Fixed test-first; documentation switch for production"],
  ["IS-8", "Navigation tabs overflowed on phone screens", "Usability", "Layout fixed; system tests re-run"],
  ["IS-9", "Git file-lock prompts on Windows", "Workflow friction", "Answer \"n\"; disable automatic housekeeping"],
  ["IS-10", "Independent review: an insider could edit an audit record and recompute the hash chain (DEF-08)", "Security", "Each record hash signed with a key outside the database; tests TC-SVC-034 to 036"],
  ["IS-11", "Independent review: the list-age rule (FR-21) had no automated test", "Test coverage", "Rule moved into the tested library; TC-WEB-017"],
], [9, 36, 17, 38], { size: 18 });

// =====================================================================
doc.h1("Known Limitations and Open Items");
doc.table("Limitations and open items", ["Item", "Impact", "Plan"], [
  ["Five partial requirements (Section 7.1)", "Lower staff assurance; Hausa limited to verdicts", "Maintenance plan, QRW-PRM-05"],
  ["Mock NIMC, SQLite, file-based signing key", "Not production-grade", "NIMC integration, PostgreSQL, HSM"],
  ["Revocation reaches offline points only on sync", "Revoked credential may pass for up to 30 days", "Delta lists over SMS or USSD"],
  ["Stolen agent phone usable until its 7-day token expires", "Checks possible in that agent's name", "Agent PIN unlock (FR-14) and a token deny-list at sync"],
  ["Verifier relies on the phone's clock (AS9)", "Setting the clock back could hide expiry or list age", "Check against server time at each sync"],
  ["Browser system tests run by hand, not in CI", "Regressions in screens found later", "Add to CI"],
  ["Elicitation by one observer; no usability test with users", "Usability claims rest on inspection", "Think-aloud evaluation in a pilot"],
], [32, 36, 32]);

// =====================================================================
doc.h1("Recommendations");
doc.numbered([
  "Run a field pilot at one distribution point in Kura LGA with a think-aloud usability evaluation of the Verifier.",
  "Before any pilot, add staff multi-factor authentication and the full Hausa interface.",
  "For production, integrate the real NIMC interface, move to PostgreSQL, hold the issuer key in a hardware security module and enable mutual TLS between services.",
  "Carry out a data protection impact assessment and define the consent procedure for enrolment.",
  "Introduce delta revocation lists to shorten the revocation delay at offline points.",
  "Add the browser system tests and the ZAP scan to continuous integration.",
]);

// =====================================================================
doc.h1("Compliance and Ethical Considerations");
doc.bullets([
  "**Data protection.** The credential carries a masked NIN only, with no BVN, telephone number or date of birth; the full NIN is never stored; audit records hold identifiers, not personal details.",
  "**Inclusion.** Paper wallets for farmers without smartphones; separate PIN-protected profiles on shared phones; Hausa verdicts with colour and icons.",
  "**Human oversight.** The face check is made by a person, not by software, so no biometric model decides who is served; every rejection is recorded with its reason for review.",
  "**Honest evidence.** No field data was invented; personas are labelled illustrative; test data is fictional; every figure in this report is produced by a test or scan in the repository.",
]);

// =====================================================================
doc.h1("Responsible Use of AI");
doc.p("In line with Instruction F, AI tools were used responsibly and ethically in this project, within the University's regulations on academic integrity. The candidate directed the work and is responsible for every design decision and for the content of the submission. All outputs were checked by testing and review before they were accepted, and no data, observations or results were fabricated. AI assistance is acknowledged in the project's version history.");

// =====================================================================
doc.h1("References");
doc.references([
  "African Farming. (2026). *Katsina launches fertiliser scheme to strengthen 2026 farming season*. https://africanfarming.net/crops/agriculture/katsina-launches-fertiliser-scheme-to-strengthen-2026-farming-season",
  "Fältström, P., Ljunggren, F., & van Gulik, D.-W. (2022). *The Base45 data encoding* (RFC 9285). Internet Engineering Task Force. https://doi.org/10.17487/RFC9285",
  "IEEE. (2008). *IEEE standard for software and system test documentation* (IEEE Std 829-2008). Institute of Electrical and Electronics Engineers.",
  "IEEE. (2009). *IEEE standard for information technology — Systems design — Software design descriptions* (IEEE Std 1016-2009). Institute of Electrical and Electronics Engineers.",
  "Josefsson, S., & Liusvaara, I. (2017). *Edwards-curve digital signature algorithm (EdDSA)* (RFC 8032). Internet Engineering Task Force. https://doi.org/10.17487/RFC8032",
  "Nigeria Data Protection Commission. (2023). *Nigeria Data Protection Act, 2023*. Federal Republic of Nigeria.",
  "Nwaobiala, C. U., & Ubor, V. U. (2019). Effectiveness of electronic wallet system of Growth Enhancement Support Scheme distribution among arable crop farmers in Imo State, South-Eastern Nigeria. *Scientific Papers Series Management, Economic Engineering in Agriculture and Rural Development, 16*(1).",
  "Sommerville, I. (2016). *Software engineering* (10th ed.). Pearson.",
]);

// =====================================================================
doc.appendix("A", "Repository Structure");
doc.table("Repository structure", ["Folder", "Content"], [
  ["core/", "qrw_core library and its tests"],
  ["services/", "Five FastAPI services, tests and the local launcher"],
  ["web/", "Progressive web app, browser-library tests and Playwright system tests"],
  ["tools/", "Requirements catalogue, RTM generator, test catalogue, ZAP scan script"],
  ["docs/uml/", "PlantUML sources for all diagrams"],
  ["docs/evidence/", "Test, coverage, performance, Bandit, audit and ZAP reports; CI screenshot"],
  ["docs/build/", "Generators for the seven Word and PDF documents (build_all.sh)"],
  ["docs/deliverables/", "The seven documents in Word and PDF"],
  [".github/workflows/", "Continuous integration pipeline"],
], [26, 74]);
doc.appendix("B", "Abbreviations");
doc.table("Abbreviations", ["Term", "Meaning"], [
  ["CI", "Continuous integration"], ["DAST / SAST", "Dynamic / static application security testing"],
  ["FR / NFR", "Functional / non-functional requirement"], ["HSM", "Hardware security module"],
  ["L1 / L2", "Assurance levels: paper wallet / smartphone wallet"], ["LGA", "Local Government Area"],
  ["NIMC / NIN", "National Identity Management Commission / National Identification Number"],
  ["NDPA", "Nigeria Data Protection Act 2023"], ["PWA", "Progressive web app"],
  ["RBAC", "Role-based access control"], ["RTM", "Requirements Traceability Matrix"],
  ["SPI", "Schedule performance index"], ["TDD", "Test-driven development"],
], [24, 76], { keepRows: 20 });

doc.save(process.argv[2], []).then(() => console.log("written", process.argv[2]));
