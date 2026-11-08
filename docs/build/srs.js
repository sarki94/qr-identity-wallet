const path = require("path");
const { Doc, LAND_TEXT_W } = require("./lib");
const R = require("./requirements.json");
const UML = process.env.UML_PNG; // folder with rendered PlantUML PNGs
const SHOTS = path.join(__dirname, "..", "screenshots");
const req = (id) => R.reqs.find((r) => r.id === id);
const rows = (ids) => ids.map((id) => { const r = req(id); return [r.id, r.text, r.priority, r.status]; });

const doc = new Doc({ code: "QRW-SRS-01", title: "Software Requirements Specification", version: "1.1", date: "November 2026",
  related: "QRW-SDD-02 Design · QRW-SEC-03 Security · QRW-TST-04 Test Plan & Report · QRW-PRM-05 Project, Risk & Maintenance · QRW-USR-06 User Manual · QRW-TR-07 Technical Report" });

// =====================================================================
doc.h1("Introduction");
doc.h2("Purpose");
doc.p("This Software Requirements Specification (SRS) defines the requirements of the Offline-First Cryptographic QR Identity Wallet, the solution developed for Question 4 of the COEN838 Advanced Software Engineering project examination. It states what the system shall do, the qualities it shall have and the constraints under which it operates. It is the baseline against which the design (QRW-SDD-02), the threat model (QRW-SEC-03) and the tests (QRW-TST-04) are traced. The structure follows the six-section SRS template presented in the course: introduction, general overview, specific requirements, system features, external interface requirements and software life cycle considerations.");
doc.p("The intended readers are the course examiners, a programme sponsor such as a State Ministry of Agriculture, and the developer responsible for building and maintaining the system.");

doc.h2("Problem Statement and Scope");
doc.p("The examination question states the problem as follows: rural citizens in Nigeria often cannot access public services, such as local clinics and agricultural subsidies, because online National Identification Number (NIN) and Bank Verification Number (BVN) verification fails due to poor network connectivity.");
doc.p("The system addresses this by moving trust off the network. An enrolment office issues each citizen a credential that is digitally signed by the issuing authority and carried as a QR code, either in a smartphone wallet or on a printed card. At the point of service, a verifier application checks the signature, expiry, revocation status and, for smartphone wallets, proof that the person holds the private key bound to the credential. All of these checks run with no network connection. Records of each check are queued on the verifier's phone and uploaded to a tamper-evident audit log when connectivity returns.");
doc.p("The primary case study is a farmer collecting subsidised fertiliser at a ward distribution point in Kura Local Government Area (LGA), Kano State. Clinic attendance is a secondary use case that uses the same mechanism.");
doc.lead("In scope", "farmer enrolment against the NIN register; issuance, revocation and offline verification of identity credentials; smartphone (L2) and paper (L1) wallets; staff authentication and role-based access; and an audit trail of verifications.");
doc.lead("Out of scope", "entitlement management, meaning how many bags a farmer may collect or whether a collection has already taken place. This belongs to subsidy-distribution systems such as the one in examination Question 3. The system answers \"is this the real Musa?\", not \"how much fertiliser does Musa get?\". Live integration with the National Identity Management Commission (NIMC) is also out of scope; a mock NIMC service stands in for it (Section 2.6).");

doc.h2("Definitions, Acronyms and Abbreviations");
doc.p(`The terms used throughout this document are defined in Table ${doc.peekTable()}.`);
doc.table("Definitions and abbreviations", ["Term", "Meaning"], [
  ["Credential", "A signed statement by the Issuer of a farmer's identity details (masked NIN, name, ward, LGA, state, validity dates and, for L2, the wallet's public key)."],
  ["L1 / L2", "Assurance levels. L1: printed QR card (paper wallet), checked by signature and the agent's visual comparison. L2: smartphone wallet, additionally proved by challenge–response with a device key."],
  ["Holder binding", "Proof that the person presenting a credential controls the private key bound into it."],
  ["Challenge–response", "The verifier shows a fresh random number (nonce); the wallet signs it together with the credential ID; the verifier checks the signature."],
  ["Revocation list", "A signed, versioned list of credential IDs that are no longer valid."],
  ["Offline-first", "Designed so that the core task works with no network; the network only refreshes data when available."],
  ["PWA", "Progressive Web App: a web application installable on a phone and able to run offline."],
  ["JWT", "JSON Web Token: a signed token carrying a user's identity and role."],
  ["Ed25519", "The Edwards-curve digital signature algorithm defined in RFC 8032 (Josefsson & Liusvaara, 2017)."],
  ["Base45", "Encoding defined in RFC 9285 that maps binary data onto the QR alphanumeric character set (Fältström et al., 2022)."],
  ["NIN, BVN, NIMC", "National Identification Number; Bank Verification Number; National Identity Management Commission."],
  ["LGA, ADP", "Local Government Area; Agricultural Development Programme."],
  ["RTM", "Requirements Traceability Matrix."],
  ["FR, NFR", "Functional requirement; non-functional requirement."],
  ["MoSCoW", "Priority scheme: Must have (M), Should have (S), Could have (C), Won't have this time (W)."],
], [22, 78]);

doc.h2("Stakeholders");
doc.p(`The stakeholders and their goals are listed in Table ${doc.peekTable()}. Their identifiers (A1–A6) are used in the use-case model in Section 4.`);
doc.table("Stakeholders and their goals", ["ID", "Stakeholder", "Role in the system", "Main goal"], [
  ["A1", "Farmer (holder)", "Holds a wallet or paper wallet and presents it", "Collect inputs without repeat trips or being turned away"],
  ["A2", "Enrolment officer", "LGA agriculture office staff; enrols, issues, revokes", "Register genuine farmers once and correctly"],
  ["A3", "Redemption agent", "Extension staff at a ward distribution point; verifies farmers, often offline", "Fast, unambiguous verdict for a long queue"],
  ["A4", "Programme administrator", "State Ministry of Agriculture; manages staff accounts", "Control who can issue and verify"],
  ["A5", "Auditor / M&E officer", "Reviews verification records", "Detect fraud and prove what happened"],
  ["A6", "NIMC (external system)", "Authoritative NIN register (mocked)", "Confirm that a NIN exists and matches a person"],
], [8, 22, 38, 32]);

doc.h2("Requirements Elicitation");
doc.h3("Choice of technique");
doc.p(`The course covered contextual inquiry, ethnography, questionnaires and use-case analysis, and the examination brief also names Joint Application Development (JAD) and protocol analysis. Their suitability for this problem is assessed in Table ${doc.peekTable()}.`);
doc.table("Suitability of elicitation techniques", ["Technique", "Suitability", "Reason"], [
  ["Questionnaires / surveys", "Low", "Low literacy among rural farmers, dispersed respondents, and answers that reflect what respondents believe rather than what they do."],
  ["Interviews / contextual inquiry", "Medium", "Captures officials' view of the process, but workarounds such as proxy attempts and phone sharing are rarely volunteered."],
  ["JAD", "Low", "Requires officers, agents and administrators to meet together; not feasible for a single-candidate project in the examination period."],
  ["Ethnography (direct, non-participant observation)", "High (primary)", "Exposes tacit knowledge: the undocumented practices and workarounds of a real distribution day, which the lecturer identified as the weakness of interview-only elicitation."],
  ["Use-case analysis", "High (modelling)", "Converts observed practice into actors, goals and flows for the UML models."],
  ["Protocol analysis (think-aloud)", "Medium (validation)", "Better suited to evaluating the prototype with agent-role users."],
], [28, 16, 56]);
doc.p("Ethnography, in the form of direct non-participant observation, was therefore adopted as the primary technique. It was supported by document analysis, and use-case analysis was used to model the findings.");
doc.h3("Sources and the as-is process");
doc.p("The author observed manual fertiliser distribution in Kura LGA, Kano State, during the 2024 wet season, attending as an observer and taking no part in the distribution. No personal data about individual farmers was recorded. The observation was triangulated with published evaluations of the Growth Enhancement Support (GES) e-wallet scheme, which list network problems among redemption constraints (Nwaobiala & Ubor, 2019), and with reports of current state schemes that distribute to polling-unit level so that \"genuine farmers\" can collect directly (African Farming, 2026).");
doc.p("In the observed as-is process the farmer queues on the announced day; the agent finds the farmer's name on a printed ward register; the farmer shows an identity document (a NIN slip or voter's card) for visual comparison; where documents are missing a community leader such as the *Mai Unguwa* or a farmer-group representative vouches for the farmer; and the agent records the collection on the paper register, which is later passed to the LGA office. Identity checking is deliberately manual in order to prevent fraud. This process has three weaknesses: trust depends on a network that is often unavailable, visual document checks can be defeated by borrowed or altered documents, and paper records cannot be audited for later alteration.");
doc.h3("Findings and derived requirements");
doc.p(`Table ${doc.peekTable()} links each finding to the requirements it produced. Findings F1–F3 and F6–F9 are tacit: they would not appear in a programme policy document and surfaced only through observation.`);
doc.table("Elicitation findings and derived requirements", ["ID", "Finding", "Source", "Derived requirements"], [
  ["F1", "Proxy collection is attempted but discouraged; identity is checked manually to prevent fraud.", "Observation", "FR-17, FR-19, FR-23"],
  ["F2", "Households share one phone among several adults.", "Observation", "FR-10, FR-11, NFR-S2"],
  ["F3", "Many farmers own only feature phones or no phone.", "Observation", "FR-05, FR-20 (L1 paper wallet)"],
  ["F4", "Network failure is a recurring constraint at redemption points.", "Literature, observation", "FR-13, FR-15, FR-21, NFR-P3"],
  ["F5", "Schemes aim to reach genuine farmers directly and remove middlemen.", "Literature", "FR-06, FR-26"],
  ["F6", "Hausa is the working language; many farmers read little English.", "Observation", "NFR-U1, NFR-U2"],
  ["F7", "Paper registers are the fallback record and cannot be checked for later alteration.", "Observation", "FR-22, FR-24, FR-25, NFR-S6"],
  ["F8", "Distribution points can be far from the LGA office.", "Observation", "FR-13 (wallet fully offline)"],
  ["F9", "Community vouching is used when documents fail.", "Observation", "FR-19 (verifiable alternative)"],
], [7, 50, 18, 25]);
doc.lead("Limitations", "the observation was made by a single observer in one LGA during one season and recorded retrospectively. Requirements with a documentary basis (F4, F5) are supported by independent published sources, and the tacit findings are exercised by scenario-based system tests and a planned think-aloud evaluation with agent-role users.");

doc.h2("References");
doc.references([
  "African Farming. (2026). *Katsina launches fertiliser scheme to strengthen 2026 farming season*. https://africanfarming.net/crops/agriculture/katsina-launches-fertiliser-scheme-to-strengthen-2026-farming-season",
  "Fältström, P., Ljunggren, F., & van Gulik, D.-W. (2022). *The Base45 data encoding* (RFC 9285). Internet Engineering Task Force. https://doi.org/10.17487/RFC9285",
  "ISO/IEC/IEEE. (2018). *Systems and software engineering — Life cycle processes — Requirements engineering* (ISO/IEC/IEEE 29148:2018).",
  "Josefsson, S., & Liusvaara, I. (2017). *Edwards-curve digital signature algorithm (EdDSA)* (RFC 8032). Internet Engineering Task Force. https://doi.org/10.17487/RFC8032",
  "Jones, M., Bradley, J., & Sakimura, N. (2015). *JSON Web Token (JWT)* (RFC 7519). Internet Engineering Task Force. https://doi.org/10.17487/RFC7519",
  "Federal Republic of Nigeria. (2023). *Nigeria Data Protection Act, 2023*.",
  "Nwaobiala, C. U., & Ubor, V. U. (2019). Effectiveness of electronic wallet system of Growth Enhancement Support Scheme distribution among arable crop farmers in Imo State, South-Eastern Nigeria. *Scientific Papers Series Management, Economic Engineering in Agriculture and Rural Development, 16*(1).",
  "Sommerville, I. (2016). *Software engineering* (10th ed.). Pearson.",
]);

doc.h2("Overview of the Document");
doc.p("Section 2 describes the product's context, functions, users, environment, constraints and assumptions. Section 3 states the functional and non-functional requirements, the domain model and the formal state-transition specification. Section 4 describes each system feature with its use cases and sequence model. Section 5 defines the external interfaces, and Section 6 the life-cycle, version-control and continuous-integration approach. Appendix A contains the full Requirements Traceability Matrix.");

// =====================================================================
doc.h1("General Overview");
doc.h2("Product Perspective");
doc.p(`The system is a new, self-contained product built from four core back-end services, a mock NIMC service (five services in all) and one installable web application, as shown in Figure ${doc.peekFig()}. The Issuer, Trust & Revocation, Audit & Sync and Auth services run on a server; the Issuer Portal, Citizen Wallet and Verifier are screens of a single Progressive Web App that runs on laptops and Android phones. The wallet and the verifier communicate with each other only through QR codes, which is what allows verification without a network.`);
doc.figure("System context and service architecture (solid arrows: synchronous calls; dashed arrows: asynchronous or offline exchanges)", `${UML}/AR1.png`, 16);
doc.h2("Product Functions");
doc.p("At a high level, the system shall:");
doc.bullets([
  "enrol farmers by confirming their NIN with NIMC, storing only a masked NIN and a keyed hash;",
  "issue Ed25519-signed identity credentials to a smartphone wallet (L2) or as a printed card (L1), and revoke them;",
  "publish the issuer's public keys and a signed revocation list for verifiers to download;",
  "let a redemption agent verify a credential, the holder's possession of the device key and the holder's face, entirely offline;",
  "queue every verification on the verifier and upload it to a hash-chained audit log when connectivity returns;",
  "authenticate staff and restrict every operation to the appropriate role.",
]);
doc.h2("User Characteristics");
doc.p(`The personas in Table ${doc.peekTable()} are illustrative composites built from the elicitation findings; they do not describe real people.`);
doc.table("User personas", ["Persona", "Characteristics", "Implications"], [
  ["P1 Malam Musa Ibrahim, farmer (L2)", "Aged 48; rice and maize near Kura, Kano. Shares an Android phone with his adult son. Reads Hausa; limited English.", "Multiple PIN-protected profiles per phone; icon and colour verdicts."],
  ["P2 Hajiya Hauwa Garba, farmer (L1)", "Aged 55; groundnut farmer; feature phone only.", "Printed paper wallet; agent's visual check."],
  ["P3 Malam Bello Sani, redemption agent", "Extension staff at a ward distribution point; Android phone; signal intermittent or absent for days.", "Offline verification; at most four taps; list-age warnings."],
  ["P4 Enrolment officer", "Office-based with reliable connectivity.", "Online issuance, wallet binding, card printing, revocation."],
  ["P5 State M&E officer (auditor)", "Reviews records across wards.", "Chain check, filters, cloning flags."],
], [27, 43, 30]);
doc.h2("Operating Environment");
doc.bullets([
  "**Services:** Python 3.11 or later with FastAPI; each service owns its own database (SQLite in the prototype, PostgreSQL in production); deployable with Docker Compose or the included launcher on Windows, macOS or Linux.",
  "**Web application:** React 18 and TypeScript, built with Vite as a Progressive Web App; runs in current Chrome or Edge on Android 8 or later and on desktop computers.",
  "**Phones:** a camera is needed to scan QR codes; HTTPS is required by the browser for the camera and for Web Crypto.",
  "**Network:** enrolment offices are online; distribution points may be offline for days.",
]);
doc.h2("Design and Implementation Constraints");
doc.bullets([
  "Single developer; fixed examination deadline of 8 November 2026.",
  "Architecture must be distributed or service-oriented (examination brief).",
  "Cryptography limited to well-established primitives: Ed25519 signatures, SHA-256 hashing, PBKDF2 and AES-GCM in the browser; no custom cryptography.",
  "Personal data handled according to the principles of the Nigeria Data Protection Act 2023: purpose limitation and data minimisation.",
  "Low-end Android phones and low literacy among users (Section 2.3).",
]);
doc.h2("Assumptions and Dependencies");
doc.p(`As required by Instruction D of the examination, every assumption made in interpreting the problem is stated in Table ${doc.peekTable()}. Domain invariants that practitioners treat as obvious, such as the phone clock being right (AS9), are stated explicitly because leaving such tacit knowledge unstated is a common cause of requirements failure.`);
doc.table("Assumptions and dependencies", ["ID", "Assumption", "Consequence if false"], [
  ["AS1", "NIMC is represented by a mock service with fictional records; production integration requires NIMC licensing.", "Issuer must call the real NIMC interface; no change to credentials or verifiers."],
  ["AS2", "The issuer signing key is held in an encrypted file in the prototype; production would use a hardware security module.", "Key compromise risk rises; see risk register."],
  ["AS3", "L2 holders have an Android phone (own or shared) with a camera; all others use the L1 paper wallet.", "More L1 use, lower assurance."],
  ["AS4", "Agents are given an Android smartphone by the programme.", "Verification cannot run at that point."],
  ["AS5", "Distribution points obtain at least intermittent connectivity within seven days.", "Revocations reach them later; the 30-day refusal rule applies."],
  ["AS6", "Entitlement (quantities and collection status) is managed by a separate programme system.", "Scope would extend into Question 3."],
  ["AS7", "Proxy collection is prohibited by programme policy (observed in Kura).", "A delegation feature would be needed."],
  ["AS8", "Enrolment takes place at an office with connectivity.", "Offline issuance would need a different key-protection design."],
  ["AS9", "The agent's phone shows the correct date (to within a day). Expiry checks and the 7- and 30-day list-age rules use the phone's clock; the demo clock can only move time forward, which makes the rules stricter.", "An expired credential or a stale list could be accepted if the clock is set back; planned fix: compare with server time at each sync."],
], [8, 57, 35]);

// =====================================================================
doc.h1("Specific Requirements");
doc.p("Each requirement has a unique identifier used in the RTM, a MoSCoW priority and an implementation status. Status is reported honestly: **Implemented**, or **Partial** with the missing part stated.");
doc.h2("Functional Requirements");
const groups = [
  ["Enrolment and issuance", ["FR-01", "FR-02", "FR-03", "FR-04", "FR-05", "FR-06", "FR-07"]],
  ["Trust and revocation", ["FR-08", "FR-09"]],
  ["Citizen wallet", ["FR-10", "FR-11", "FR-12", "FR-13"]],
  ["Verifier", ["FR-14", "FR-15", "FR-16", "FR-17", "FR-18", "FR-19", "FR-20", "FR-21", "FR-22", "FR-23"]],
  ["Audit and synchronisation", ["FR-24", "FR-25", "FR-26"]],
  ["Staff access", ["FR-27", "FR-28", "FR-29"]],
];
for (const [name, ids] of groups) {
  doc.h3(name);
  doc.p(`The ${name.toLowerCase()} requirements are listed in Table ${doc.peekTable()}.`);
  doc.table(`Functional requirements: ${name.toLowerCase()}`, ["ID", "The system shall…", "Priority", "Status"], rows(ids), [10, 61, 11, 18]);
}
doc.h3("Formal specification as state transitions");
doc.p("Following the course's formal notation, a functional requirement can be expressed as a state-transition function *f*: S × I → S × O, where S is the set of system states, I the inputs and O the outputs. The verification behaviour (FR-16 to FR-22) is specified this way in Table " + doc.peekTable() + ", with S = {Idle, CredentialRead, ChallengeShown, AwaitingFaceCheck, Accepted, Rejected, RecordQueued}.");
doc.table("Verification behaviour as f: S × I → S × O", ["Current state (S)", "Input (I)", "Next state (S)", "Output (O)"], [
  ["Idle", "Scan credential QR", "CredentialRead", "Parsed credential"],
  ["CredentialRead", "Signature invalid, expired, revoked, unreadable, or list older than 30 days", "Rejected", "Reason shown"],
  ["CredentialRead", "Valid and level = L2", "ChallengeShown", "Challenge QR (fresh nonce)"],
  ["CredentialRead", "Valid and level = L1", "AwaitingFaceCheck", "Signed details and photo"],
  ["ChallengeShown", "Answer signed by the holder key", "AwaitingFaceCheck", "Signed details and photo"],
  ["ChallengeShown", "Invalid answer or 60 s timeout", "Rejected", "\"Copy or replay\" reason"],
  ["AwaitingFaceCheck", "Agent confirms the face", "Accepted", "Accepted (L1 or L2)"],
  ["AwaitingFaceCheck", "Agent rejects the face", "Rejected", "\"Face mismatch\""],
  ["Accepted or Rejected", "(automatic)", "RecordQueued", "Record added to local queue"],
], [22, 34, 20, 24]);
doc.p(`The same behaviour is drawn as a state machine in Figure ${doc.peekFig()}, in the guarded style the lecturer used for the HeartRateMonitor example, and the credential lifecycle (FR-03 to FR-07) in Figure ${doc.section}.${(doc.figNo[doc.section] || 0) + 2}.`);
doc.figure("State machine of a verification session (guards in square brackets)", `${UML}/SM1.png`, 11);
doc.figure("State machine of the credential lifecycle", `${UML}/SM2.png`, 8);

doc.h2("Non-Functional Requirements");
doc.p("The non-functional requirements are grouped under the four categories used in the course template. Where a requirement is measurable, the value measured by the automated tests on 3 November 2026 is given.");
const measured = {
  "NFR-P1": "0.32 ms (Python), 4.3 ms (browser library) per full check",
  "NFR-P2": "8 ms per issuance",
  "NFR-C1": "Within 1,800 bytes with a 1 KB photo",
  "NFR-C2": "3.4 KB for five profiles",
  "NFR-C3": "0.94 MB in transit, 1.41 MB cached",
  "NFR-C4": "2,000 records accepted in one batch",
};
for (const [cat, ids] of [["Performance", ["NFR-P1", "NFR-P2", "NFR-P3"]], ["Security", ["NFR-S1", "NFR-S2", "NFR-S3", "NFR-S4", "NFR-S5", "NFR-S6", "NFR-S7", "NFR-S8"]],
  ["Usability", ["NFR-U1", "NFR-U2", "NFR-U3", "NFR-U4"]], ["Capacity and Space", ["NFR-C1", "NFR-C2", "NFR-C3", "NFR-C4"]]]) {
  doc.h3(cat.charAt(0) + cat.slice(1).toLowerCase());
  doc.p(`Table ${doc.peekTable()} lists the ${cat.toLowerCase()} requirements.`);
  doc.table(`${cat} requirements`, ["ID", "Requirement", "Priority", "Status", "Measured"],
    ids.map((id) => { const r = req(id); return [r.id, r.text, r.priority, r.status, measured[id] || "—"]; }), [11, 39, 11, 18, 21]);
}

doc.h2("Logical Data Requirements");
doc.p(`The domain model in Figure ${doc.peekFig()} shows the information the system manages, grouped by the service that owns it. Following the course's emphasis on domain integrity, composition expresses that a Credential cannot exist without its Farmer, who must first have been confirmed by NIMC, in the same way that the lecturer's example required a Customer to exist before an Order. Three integrity rules apply: a credential can only be created for an enrolled farmer; at most one credential per farmer is active; and an L2 credential carries exactly one holder key.`);
doc.figure("Domain model (class diagram) by owning service", `${UML}/CD.png`, 16);

// =====================================================================
doc.h1("System Features");
doc.p(`The system's features are organised around the use cases in Figure ${doc.peekFig()}. Each use case carries an identifier that appears in the RTM.`);
doc.figure("Use-case diagram", `${UML}/UC.png`, 10, { maxHeightCm: 19 });
const uc = (id, name, actor, pre, main, alt, post, frs) => doc.table(`Use case ${id}: ${name}`, ["Element", "Description"], [
  ["Actors", actor], ["Preconditions", pre], ["Main flow", main], ["Alternative flows", alt], ["Postconditions", post], ["Requirements", frs]], [22, 78]);

doc.h2("Enrolment and Issuance");
doc.p("**Description and priority.** Must have. An enrolment officer confirms a farmer's identity with NIMC and issues a signed credential to the farmer's wallet or as a paper wallet. Issuing again for the same farmer revokes the earlier credential in the same database transaction.");
doc.p(`**Stimulus and response.** The officer enters a NIN; the system returns the NIMC record. The officer scans the wallet's binding code (L2) or chooses a paper wallet (L1); the system returns a signed credential QR. The interaction is shown in Figure ${doc.peekFig()}.`);
doc.figure("Sequence diagram: enrolment and credential issuance (synchronous)", `${UML}/SD1.png`, 16);
uc("UC-01/02/03", "Enrol farmer, issue credential, bind wallet", "Enrolment officer (primary); farmer; NIMC (secondary)",
  "Officer signed in; NIMC reachable.",
  "1. Officer enters NIN. 2. System looks up NIMC and shows the record. 3. Farmer creates a wallet profile with a PIN; wallet shows binding code. 4. Officer scans it. 5. System signs and returns the credential. 6. Farmer scans it into the wallet.",
  "2a. NIN not found: system reports it and stops. 3a. Farmer has no smartphone: officer selects L1 and prints the paper wallet (UC-04). 5a. Farmer already has an active credential: it is revoked in the same transaction and a new revocation list is published.",
  "One active credential for the farmer; revocation list updated if a previous one existed.", "FR-01 to FR-06");
doc.h2("Citizen Wallet");
doc.p("**Description and priority.** Must have. The wallet holds one or more farmer profiles on a shared phone. Each profile has its own device key pair, sealed with its own six-digit PIN, and its own credential. All wallet functions work without a network.");
uc("UC-06/07", "Manage profiles and present credential", "Farmer", "Credential saved in the profile.",
  "1. Farmer selects the profile and enters the PIN. 2. Wallet shows the credential QR. 3. Agent shows a challenge; farmer scans it. 4. Wallet signs the challenge with the device key and shows the answer QR.",
  "1a. Wrong PIN: remaining attempts shown; after five failures the profile is locked for five minutes. 3a. Challenge is for a different credential: wallet refuses.",
  "Agent holds the signed answer; the private key never leaves the phone.", "FR-10 to FR-13");
doc.h2("Offline Verification");
doc.p(`**Description and priority.** Must have. This is the core feature required by the problem statement. The agent's phone verifies the credential, the holder and the face using only data downloaded at its last synchronisation. The sequence is shown in Figure ${doc.peekFig()}.`);
doc.figure("Sequence diagram: offline verification at a distribution point", `${UML}/SD2.png`, 16);
uc("UC-08", "Verify farmer offline", "Redemption agent (primary); farmer", "Verifier has synchronised at least once and its revocation list is less than 30 days old.",
  "1. Agent scans the credential QR. 2. Verifier checks signature, expiry and revocation. 3. For L2, verifier shows a challenge and scans the wallet's answer. 4. Verifier shows the signed details and photo. 5. Agent confirms the face. 6. Verifier shows ACCEPTED and queues a record.",
  "2a. Any check fails: REJECTED with the reason. 3a. Answer invalid or late: REJECTED (copy or replay). 5a. Face does not match: REJECTED. 0a. List older than seven days: warning; older than 30 days: no acceptance until synchronised.",
  "A verification record is queued.", "FR-16 to FR-23");
doc.h2("Revocation and Synchronisation");
doc.p(`**Description and priority.** Must have. The officer revokes a credential; the Issuer signs a new revocation list and pushes it to the Trust service. Verifiers download keys and the list, and upload their queued records, whenever they have a signal (Figure ${doc.peekFig()}).`);
doc.figure("Sequence diagram: revocation and asynchronous synchronisation", `${UML}/SD3.png`, 16);
uc("UC-05/09/10", "Revoke, synchronise, upload records", "Enrolment officer; redemption agent", "Officer online; agent's phone regains signal.",
  "1. Officer revokes with a reason. 2. Issuer signs list version n+1 and pushes it to Trust, which verifies it. 3. Verifier downloads keys and the list and checks the signature. 4. Verifier uploads queued records; Audit chains them.",
  "2a. Trust unreachable: revocation is stored and republished later. 3a. Older list offered: refused. 4a. Upload interrupted: retried; duplicates are ignored.",
  "Verifier refuses the revoked credential from its next check.", "FR-07 to FR-09, FR-15, FR-24");
doc.h2("Audit");
doc.p("**Description and priority.** Must have (FR-26 Should have). The auditor reviews all verification records, filters them, checks the integrity of the hash chain and sees credentials accepted at two distribution points within 24 hours.");
doc.h2("Staff Access Management");
doc.p("**Description and priority.** Must have. Staff sign in with a username and password and receive a signed token carrying their role and, for agents, their distribution point. Every service enforces role-based access. Administrators create, disable and unlock accounts. Agent tokens last seven days so that verifiers can work offline.");

// =====================================================================
doc.h1("External Interface Requirements");
doc.h2("User Interfaces");
doc.p(`The four screens of the web application and their users are listed in Table ${doc.peekTable()}. Verdicts use colour, an icon and a Hausa word (\"An karɓa\" for accepted, \"An ƙi\" for rejected) so that they can be read without English (NFR-U2), and touch targets are at least 48 pixels high (NFR-U4). Figure ${doc.peekFig()} shows the verifier's accepted verdict.`);
doc.table("User interface screens", ["Screen", "Device", "User", "Network"], [
  ["Issuer Portal", "Laptop at LGA office", "Enrolment officer", "Required"],
  ["Citizen Wallet", "Farmer's (shared) Android phone", "Farmer", "Not required after enrolment"],
  ["Verifier", "Agent's Android phone", "Redemption agent", "Only to synchronise"],
  ["Audit", "Laptop", "Auditor", "Required"],
  ["Guided Demo", "Laptop or projector", "Presenter", "Required (calls live services)"],
], [22, 30, 24, 24]);
doc.figure("Verifier screen showing an offline acceptance", path.join(SHOTS, "09-verifier-accepted.png"), 6.5);
doc.h2("Hardware Interfaces");
doc.bullets([
  "Phone or laptop camera for QR scanning, accessed through the browser; a paste fallback exists for devices without a camera.",
  "Any printer for L1 paper wallets, through the browser's print function.",
  "Optional camera at the enrolment office for the farmer's photo thumbnail.",
]);
doc.h2("Software Interfaces");
doc.p(`The services expose REST interfaces with JSON bodies. The main operations are summarised in Table ${doc.peekTable()}; each service also publishes interactive OpenAPI documentation at /docs.`);
doc.table("Service interfaces", ["Service (port)", "Operation", "Caller / role"], [
  ["Auth (8001)", "POST /token; GET /me; GET /public-key; POST, GET, PATCH /users", "All staff; Admin for /users"],
  ["Issuer (8002)", "POST /enrolments; POST /credentials; POST /credentials/{id}/revoke; POST /revocations/publish; GET /farmers/{id}/credentials", "Officer (Admin for republish and listing)"],
  ["Trust & Revocation (8003)", "GET /keys; GET /revocations; PUT /internal/revocations", "Anyone (public data); Issuer with service key"],
  ["Audit & Sync (8004)", "POST /records; GET /records; GET /records/verify-chain; GET /anomalies", "Agent (upload); Auditor and Admin"],
  ["Mock NIMC (8005)", "GET /nin/{nin}", "Issuer only"],
], [24, 52, 24]);
doc.h2("Communication Interfaces");
doc.p(`Between phones and the server, all traffic uses HTTPS through a single origin, with requests proxied to the services. Between the wallet and the verifier there is no network: the devices exchange the four QR formats in Table ${doc.peekTable()}.`);
doc.table("Device-to-device QR formats", ["Prefix", "Carries", "From → to"], [
  ["QRW1:", "Base45 of zlib(signature ‖ credential JSON)", "Wallet or paper wallet → verifier; portal → wallet"],
  ["QRW1B:", "Wallet's public key (binding code)", "Wallet → issuer portal"],
  ["QRW1C:", "Credential ID and fresh nonce (challenge)", "Verifier → wallet"],
  ["QRW1R:", "Credential ID and signature over the challenge (answer)", "Wallet → verifier"],
], [14, 50, 36]);

// =====================================================================
doc.h1("Software Life Cycle Considerations");
doc.h2("Development Methodology");
doc.p("An iterative, Agile-style approach was chosen over Waterfall. The requirements were stable in their core (offline verification) but uncertain in detail, as the change from a smartphone-only wallet to two assurance levels after elicitation showed. A solo developer working to a fixed deadline also needed working software early, because 45 of the 100 marks depend on a running system. Work was planned as daily increments with story points, which provide the earned-value figures reported in QRW-PRM-05. The cryptographic core was built test-first (TDD), and its Git history shows the failing tests committed before the implementation.");
doc.h2("Version Control");
doc.p("All source code, UML models (as PlantUML text) and documentation are kept in a single Git repository hosted on GitHub. Commits follow a conventional-commit style (feat, fix, test, docs, security). Commits made with AI assistance carry a Co-Authored-By trailer, in line with Instruction F on the responsible use of AI.");
doc.h2("Continuous Integration");
doc.p(`Every push triggers the GitHub Actions jobs listed in Table ${doc.peekTable()}.`);
doc.table("Continuous-integration jobs", ["Job", "Steps"], [
  ["Core", "Flake8 lint; Bandit static analysis; pytest with Hypothesis property tests; 90 % coverage gate"],
  ["Services", "Flake8; Bandit; pip-audit dependency scan; API, security, integration and system tests; 90 % coverage gate"],
  ["Web", "npm audit of shipped packages; TypeScript strict type-check; Vitest cross-language tests with coverage; production build"],
  ["Docker", "Builds the service image"],
], [16, 84]);
doc.h2("Requirements Traceability");
doc.p(`The RTM is generated from the code by tools/rtm.py: every test is tagged with the requirement identifiers it verifies, and the tool combines those tags with the results of an actual test run. On 3 November 2026 the matrix covered all ${R.reqs.length} requirements, with no failing tests and no unverified requirements. The full matrix is given in Appendix A in the lecturer's four-column format.`);

// =====================================================================
doc.appendix("A", "Requirements Traceability Matrix");
doc.p("Format: the lecturer's Traceability Verification Matrix. Generated by tools/rtm.py on 3 November 2026; regenerate after any change.");
const fs = require("fs");
const rtm = fs.readFileSync(path.join(__dirname, "..", "rtm.csv"), "utf8").trim().split("\n").slice(1).map((line) => {
  const cells = []; let cur = "", q = false;
  for (const ch of line) { if (ch === '"') q = !q; else if (ch === "," && !q) { cells.push(cur); cur = ""; } else cur += ch; }
  cells.push(cur); return cells;
});
doc.table("Requirements Traceability Matrix", ["Requirement ID", "UML / SysML artefact", "Code module", "Test case ID (result)"],
  rtm.map((c) => [`${c[0]} (${c[1]}, ${c[2]})`, c[4], c[5], c[6]]), [13, 25, 25, 37], { size: 16 });

doc.save(process.argv[2], [["0.1", "22 Oct 2026", "Requirements draft and elicitation"], ["0.2", "25 Oct 2026", "Localised to Kura LGA; two assurance levels (D2a)"], ["1.0", "4 Nov 2026", "Complete SRS with measured NFRs and generated RTM"], ["1.1", "8 Nov 2026", "Requirements stated as \"The system shall\"; signed audit records; FR-21 automated test; consistent measured figures"]])
  .then(() => console.log("written", process.argv[2]));
