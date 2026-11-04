const fs = require("fs");
const path = require("path");
const { Doc } = require("./lib");
const ROOT = path.resolve(__dirname, "../..");
const TC = JSON.parse(fs.readFileSync(path.join(__dirname, "testcases.json"), "utf8"));
const reqs = JSON.parse(fs.readFileSync(path.join(__dirname, "requirements.json"), "utf8"));
const MANUAL = reqs.manual;

const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const pick = (pred) => TC.filter(pred);
const levels = [
  ["Unit (core library)", (t) => t.suite === "core" && t.level === "Unit"],
  ["Unit, performance (core)", (t) => t.suite === "core" && t.level !== "Unit"],
  ["Unit (browser library)", (t) => t.suite === "web"],
  ["Integration (service APIs)", (t) => t.level === "Integration"],
  ["Integration, performance and capacity", (t) => t.level === "Integration (performance)"],
  ["Security (black-box)", (t) => t.level === "Security"],
  ["System (API, end to end)", (t) => t.level === "System (API)"],
  ["System (browser, Playwright)", (t) => t.level === "System (browser)"],
];
const totalTC = TC.length, totalCases = sum(TC, (t) => t.cases), totalPass = sum(TC, (t) => t.result === "Pass");
const prop = pick((t) => t.technique.startsWith("Property"));

const doc = new Doc({ code: "QRW-TST-04", title: "Test Plan and Test Report", version: "1.0", date: "November 2026",
  related: "QRW-SRS-01 Requirements · QRW-SDD-02 Design · QRW-SEC-03 Security" });

// =====================================================================
doc.h1("Introduction");
doc.h2("Purpose");
doc.p("This document is both the test plan and the test report for the Offline-First Cryptographic QR Identity Wallet. Part one (Sections 2 and 3) states the test strategy and the plan: what is tested, at which levels, with which techniques and tools, and what counts as a pass. Part two (Sections 4 to 7) lists the test cases, reports the results, coverage and measurements, records the defects the tests found, and evaluates how far the evidence supports the claim that the system meets its requirements. The structure follows the test plan and test summary report of IEEE 829 (IEEE, 2008).");
doc.h2("Scope");
doc.p("All three code bases are in scope: the cryptographic core library (qrw_core), the five back-end services (qrw_services) and the web application's verification library and screens. Security testing is summarised here and reported in full in QRW-SEC-03.");
doc.h2("Summary of Results");
doc.p(`**${totalTC} test cases** were designed, executing **${totalCases} individual checks** (some cases are parameterised or run several steps). **All ${totalPass} pass.** Statement coverage is 97% for the core library and 97% for the services; the browser verification library is at 90% and the PIN vault at 100%. Every one of the 48 requirements is linked to at least one passing test or a recorded manual verification, and no requirement is uncovered. Automated tests, scans and the candidate's own manual testing found seven real defects during development, all fixed (Section 6).`);
doc.h2("References");
doc.references([
  "Beck, K. (2003). *Test-driven development: By example*. Addison-Wesley.",
  "IEEE. (2008). *IEEE standard for software and system test documentation* (IEEE Std 829-2008). Institute of Electrical and Electronics Engineers.",
  "MacIver, D. R., Hatfield-Dodds, Z., & Many Other Contributors. (2019). Hypothesis: A new approach to property-based testing. *Journal of Open Source Software, 4*(43), 1891. https://doi.org/10.21105/joss.01891",
  "Sommerville, I. (2016). *Software engineering* (10th ed.). Pearson.",
  "Claessen, K., & Hughes, J. (2000). QuickCheck: A lightweight tool for random testing of Haskell programs. *Proceedings of the Fifth ACM SIGPLAN International Conference on Functional Programming*, 268–279. https://doi.org/10.1145/351240.351266",
]);

// =====================================================================
doc.h1("Test Strategy");
doc.h2("Overview");
doc.p("The strategy follows the risk of each part of the system. The trust decision (signatures, challenge–response, revocation and the audit chain) is where a defect would let a fraud through, so it gets the strongest techniques: test-driven development, property-based testing and cross-implementation testing between Python and the browser. The services are tested through their public APIs, black-box. The whole system is tested end to end both through the APIs and through real browsers. Security, performance and static analysis run alongside, and continuous integration runs everything that can be automated on every push.");
doc.p(`Table ${doc.peekTable()} shows the levels, their tools and the number of test cases at each level.`);
doc.table("Test levels, tools and counts", ["Level", "What is tested", "Tools", "Test cases", "Checks run"], levels.map(([name, f]) => {
  const t = pick(f);
  const what = {
    "Unit (core library)": "Signing, verification, encodings, QR format, challenge, revocation list, hash chain",
    "Unit, performance (core)": "Verification time, list size, signing throughput",
    "Unit (browser library)": "Browser verifier against Python-issued vectors; PIN vault; cache",
    "Integration (service APIs)": "Each service's API with real databases and keys, wired together",
    "Integration, performance and capacity": "Issuance time, batch upload, compressed list",
    "Security (black-box)": "Injection, token forgery, access control, headers, CORS, errors",
    "System (API, end to end)": "A full distribution day through every service",
    "System (browser, Playwright)": "The real PWA on three browser devices; the 16-step Guided Demo",
  }[name];
  const tools = { "Unit (browser library)": "Vitest", "System (browser, Playwright)": "Playwright" }[name] || (name.startsWith("Unit") ? "pytest, Hypothesis" : "pytest, FastAPI TestClient");
  return [name, what, tools, String(t.length), String(sum(t, (x) => x.cases))];
}).concat([["**Total**", "", "", `**${totalTC}**`, `**${totalCases}**`]]), [22, 40, 16, 11, 11]);
doc.p("In addition, static analysis (Flake8, Bandit, TypeScript strict type-checking), dependency scanning (pip-audit, npm audit) and a dynamic scan with OWASP ZAP were run; they are reported in QRW-SEC-03 and summarised in Section 5.6.");

doc.h2("Test-Driven Development");
doc.p("The core library was built test-first in the red–green–refactor cycle (Beck, 2003). The complete unit test suite for the library was written and committed before any implementation existed, and the commit history shows the failing suite followed by the implementation that makes it pass. The same discipline was used later for the defect found by the ZAP scan. Because the history is in Git, the order can be checked by anyone (Table " + doc.peekTable() + ").");
doc.table("Test-first evidence in the commit history", ["Commit", "Date", "Step", "Message"], [
  ["1411e75", "30 Oct 2026", "Red", "test(core): add failing test suite for qrw_core (TDD red)"],
  ["0c0673a", "30 Oct 2026", "Green", "feat(core): implement qrw_core to pass test suite (TDD green)"],
  ["36b9f76", "30 Oct 2026", "Refactor", "test(core): cover key storage and validation branches; add CI pipeline"],
  ["916f0ad", "4 Nov 2026", "Red", "test(security): TC-SEC-011/012 for the ZAP finding (red)"],
  ["7c44f43", "4 Nov 2026", "Green", "fix(security): strict CSP on API docs pages; ZAP scan evidence (green)"],
], [13, 15, 11, 61]);
doc.p("Behaviour-driven development (BDD) was considered and not adopted. Its main benefit is a shared, readable specification between developers and non-technical stakeholders; in a solo project that role is already played by the requirements in QRW-SRS-01, which every test names through its requirement tag. Writing Gherkin scenarios as well would have duplicated that specification without adding checks. The two system tests do, however, follow scenario form (given an issued credential, when the agent scans offline, then the verdict is accepted), which captures the main benefit of BDD where it matters.");

doc.h2("Property-Based Testing");
doc.p(`For the security-critical functions, example tests alone are weak: they only check the cases the developer thought of. Property-based tests state a rule that must hold for every input and let Hypothesis, the Python counterpart of QuickCheck (Claessen & Hughes, 2000), generate a hundred or more inputs per test run, including edge cases, and shrink any failure to the smallest example. ${prop.length} test cases use this technique (Table ${doc.peekTable()}).`);
doc.table("Properties tested with Hypothesis", ["Test case", "Property that must hold for all inputs"], prop.map((t) => [t.id, t.title]), [20, 80]);
doc.p("The most important is TC-CORE-014: for a valid credential, flipping any single bit anywhere in the signature or payload must lead to rejection. It is the executable form of the integrity requirement.");

doc.h2("Cross-Implementation Testing");
doc.p("Credentials are issued by Python on the server and verified by TypeScript in the browser. Any difference between the two (in canonical bytes, encoding or the Ed25519 verification rules) would cause genuine farmers to be rejected or, worse, forged credentials to be accepted. A script in the core library generates test vectors with the Python implementation (valid, tampered, revoked, expired and foreign-issuer credentials, a signed revocation list and challenge answers), and the browser tests must reach the same verdicts. TC-WEB-006 goes further: Ed25519 signatures are deterministic, so the browser must produce byte-for-byte the same challenge answer as Python.");

doc.h2("Requirements-Based Test Design and Traceability");
doc.p("Every test names the requirements it verifies: Python tests with a marker, for example @pytest.mark.req(\"FR-16\", \"NFR-S5\"), and browser tests in their title, for example \"TC-WEB-003 [FR-16, NFR-S5]\". A script reads these tags and the JUnit results and generates the Requirements Traceability Matrix, so the RTM always reflects the tests that actually ran and whether they passed. A requirement with no passing test shows up as uncovered. Test cases were designed from the requirements with equivalence partitioning (valid, tampered, expired, revoked, unknown issuer, malformed) and boundary values (list age at 7 and 30 days, a 2,000-record batch, an 11-digit NIN, the 8 KB inflate limit).");

doc.h2("Continuous Integration");
doc.p(`Every push to GitHub runs the pipeline in Table ${doc.peekTable()}. A job fails, and the commit is marked red, if any test fails, coverage falls below 90%, the linters or Bandit report an issue, or a shipped dependency has a known moderate or higher vulnerability.`);
doc.table("Continuous integration pipeline (GitHub Actions)", ["Job", "Steps", "Quality gate"], [
  ["core", "Install; Flake8; Bandit; pytest with Hypothesis and coverage; upload JUnit and coverage", "All tests pass; coverage ≥ 90%; no lint or Bandit issues"],
  ["services", "Install; Flake8; Bandit; pip-audit; pytest (integration, security, end to end) with coverage", "All tests pass; coverage ≥ 90%; no known vulnerable dependency"],
  ["web", "npm ci; npm audit of shipped packages; TypeScript strict type-check; Vitest with coverage; production build", "Type-check clean; all tests pass; no moderate+ advisory; build succeeds"],
  ["docker", "Build the service image", "Image builds"],
], [12, 56, 32]);

// =====================================================================
doc.h1("Test Plan");
doc.h2("Test Items");
doc.table("Test items", ["Item", "Version / location"], [
  ["qrw_core cryptographic library", "core/qrw_core, Python package 0.1.0"],
  ["Auth, Issuer, Trust and Revocation, Audit and Sync, Mock NIMC services", "services/qrw_services, FastAPI 0.162"],
  ["Web application (Wallet, Verifier, Issuer Portal, Audit, Guided Demo)", "web/src, React 18.3 + TypeScript 5.6, Vite 5.4"],
  ["Docker image and Compose configuration", "Dockerfile, docker-compose.yml"],
], [55, 45], { unnumbered: false });
doc.h2("Features to Be Tested");
doc.p("All 29 functional and 19 non-functional requirements of QRW-SRS-01: enrolment and issuance, holder binding, offline verification at both assurance levels, revocation and its distribution, synchronisation and the audit chain, staff authentication and roles, and the performance, security, capacity and usability requirements.");
doc.h2("Features Not Tested, and Why");
doc.bullets([
  "**Real NIMC integration.** The NIMC interface is not available to students; a mock with fictional records is used (assumption in QRW-SRS-01).",
  "**Field use on low-end Android phones in Kura.** Planned with npm run phone on the candidate's own phone before the defence; not yet done at the time of writing. Performance was measured in a test environment, with large margins (Section 5.4).",
  "**Load from many concurrent users.** Verification runs on the phones, so server load comes only from synchronisation, which is batched; a load test was judged lower value than the security tests for the time available.",
  "**Deferred features** (staff multi-factor authentication, full Hausa translation, agent PIN unlock): not built, so not tested. They are the five requirements marked Partial in the RTM.",
]);
doc.h2("Pass and Fail Criteria");
doc.bullets([
  "A test case passes when every assertion holds; one failed check fails the case.",
  "The test run passes when all automated test cases pass, statement coverage is at least 90% for the core library and the services, and static analysis and dependency scans report no unresolved issue.",
  "The release is acceptable when every Must requirement is covered by at least one passing test or a recorded manual verification, and no High or Medium finding from the dynamic scan is open.",
]);
doc.h2("Suspension and Resumption");
doc.p("Testing of a component is suspended when its tests cannot run (for example, a service fails to start or the vectors file is missing), because results would be meaningless. It resumes when the cause is fixed; the full suite is then re-run, not only the failed tests.");
doc.h2("Test Environment");
doc.table("Test environment", ["Element", "Development and test", "Continuous integration"], [
  ["Operating system", "Windows laptop (candidate); Linux container", "Ubuntu (GitHub-hosted runner)"],
  ["Python and test tools", "Python 3.13; pytest 9.2; Hypothesis 6.170; coverage.py", "Python 3.12, same tools"],
  ["Node and test tools", "Node 22; Vitest 2.1.4 with V8 coverage; Playwright with Chromium", "Node 20; Vitest"],
  ["Services", "Five services on localhost (8001 to 8005), SQLite, temporary keys per test", "In-process TestClient, temporary databases"],
  ["Browsers", "Chromium (Playwright), three isolated browser contexts as three devices", "Not run in CI"],
  ["Security tools", "Bandit, Flake8, pip-audit, npm audit, OWASP ZAP 2.16.1", "Bandit, Flake8, pip-audit, npm audit"],
], [20, 46, 34]);
doc.h2("Test Data");
doc.p("All test data is fictional. The mock NIMC service holds invented NIN records for Kura LGA (for example, Musa Ibrahim, Kura Ward). Each test creates its own keys and databases in a temporary folder, so tests never share state and can run in any order. Cross-implementation vectors are generated by a script and committed, so the browser tests are repeatable.");
doc.h2("Responsibilities and Schedule");
doc.p(`This is a solo project: the candidate designed, wrote and ran all tests. Testing ran alongside development, as shown in Table ${doc.peekTable()}.`);
doc.table("Testing schedule", ["Date", "Testing activity"], [
  ["30 Oct 2026", "Core unit and property-based tests written first (red), then implementation (green); CI set up"],
  ["3 Nov 2026", "Service integration and end-to-end tests; browser library tests; Playwright system tests TC-SYS-002 and TC-SYS-003; candidate's manual run of the Guided Demo on his laptop"],
  ["3 Nov 2026", "Security tests, static analysis, dependency audit; performance and capacity tests; generated RTM"],
  ["4 Nov 2026", "OWASP ZAP scan, fix and re-scan; coverage for the browser library; this report"],
  ["Before 8 Nov 2026", "Field-style test on a real phone over HTTPS (npm run phone)"],
], [20, 80]);
doc.h2("Risks and Contingencies");
doc.table("Testing risks", ["Risk", "Contingency"], [
  ["Python and browser disagree on signature rules", "Shared vectors; strict RFC 8032 mode in the browser (TC-WEB-002 to 008)"],
  ["Tests pass but the user interface is wrong", "Playwright system tests drive the real screens and save screenshots"],
  ["Timing-based performance tests are flaky on slow machines", "Budgets set far above measured values; measured figures printed"],
  ["Limited time before the deadline", "Highest-risk components tested first; deferred features recorded as Partial"],
], [42, 58]);

// =====================================================================
doc.h1("Test Cases");
doc.p(`Each test case has a unique identifier whose prefix shows its suite: TC-CORE (core library), TC-SVC (services), TC-SEC (security), TC-WEB (browser library) and TC-SYS (system). The full code of every case is in the repository, in the file named in the RTM. Tables ${doc.section}.1 to ${doc.section}.5 list every case with the requirements it verifies and its result on 4 November 2026.`);
const groups = [
  ["Core library unit and performance test cases", (t) => t.suite === "core"],
  ["Service integration, performance and end-to-end test cases", (t) => t.suite === "services" && t.level !== "Security"],
  ["Security test cases", (t) => t.level === "Security"],
  ["Browser library test cases", (t) => t.suite === "web"],
  ["Browser system test cases", (t) => t.suite === "e2e"],
];
const sub = { core: "Core Library", services: "Services" };
groups.forEach(([cap, f], i) => {
  doc.h2(["Core Library", "Services", "Security", "Browser Library", "System Tests in the Browser"][i]);
  const rows = pick(f).map((t) => [t.id, t.title + (t.cases > 1 ? ` (${t.cases} checks)` : ""), t.reqs.join(", "), t.result]);
  doc.table(cap, ["ID", "Test case", "Requirements", "Result"], rows, [15, 52, 23, 10], { size: 17 });
});
doc.p("The two browser system tests are scenario tests. TC-SYS-002 plays a full distribution day with three isolated browser contexts acting as the officer's laptop, the farmer's phone and the agent's phone: enrolment and issuance, saving the credential to the wallet, synchronising the verifier, cutting its network, then the offline check with challenge, PIN and face check, followed by a replay attempt, a tampered code and a revoked credential. TC-SYS-003 clicks through all sixteen steps of the Guided Demo against the live services.");

// =====================================================================
doc.h1("Test Results");
doc.h2("Results by Level");
doc.p(`Table ${doc.peekTable()} summarises the results of the run on 4 November 2026.`);
doc.table("Results by test level", ["Level", "Test cases", "Checks run", "Passed", "Failed"], levels.map(([n, f]) => {
  const t = pick(f); return [n, String(t.length), String(sum(t, (x) => x.cases)), String(sum(t, (x) => x.result === "Pass")), String(sum(t, (x) => x.result !== "Pass"))];
}).concat([["**Total**", `**${totalTC}**`, `**${totalCases}**`, `**${totalPass}**`, `**${totalTC - totalPass}**`]]), [40, 15, 15, 15, 15]);

doc.h2("Code Coverage");
doc.p(`Statement coverage was measured with coverage.py for Python and the V8 coverage provider for the browser library (Table ${doc.peekTable()}). CI fails the build if Python coverage falls below 90%.`);
doc.table("Statement coverage by module", ["Code base", "Module", "Statements", "Coverage"], [
  ["Core library", "audit, challenge, encoding", "82", "100%"],
  ["", "credential", "125", "98%"],
  ["", "keys", "20", "95%"],
  ["", "revocation", "39", "92%"],
  ["", "qr", "23", "87%"],
  ["", "**Total**", "**290**", "**97%**"],
  ["Services", "shared (app, config, db, security)", "124", "98%"],
  ["", "issuer", "180", "97%"],
  ["", "audit", "96", "97%"],
  ["", "trust", "64", "97%"],
  ["", "auth", "116", "96%"],
  ["", "nimc, secrets", "40", "90%"],
  ["", "**Total**", "**620**", "**97%**"],
  ["Browser library", "vault.ts (PIN vault)", "", "100%"],
  ["", "qrw.ts (verification)", "", "90%"],
  ["", "api.ts, store.ts, router.tsx", "", "0% (covered by system tests)"],
], [20, 40, 18, 22], { keepRows: 20 });
doc.p("The uncovered Python lines are defensive branches that are hard to reach from outside, such as a key file missing at start-up. In the browser library, the security-critical code (verification and the PIN vault) is covered by unit tests; the network client, storage helper and router are thin glue code exercised by the Playwright system tests rather than by unit tests, which is why the overall browser figure (66%) is lower. Coverage measures what was executed, not what was checked, which is why it is used here alongside property-based tests and the requirement-level RTM rather than as a goal in itself.");

doc.h2("Requirements Coverage");
doc.p("The generated RTM (QRW-SRS-01, Appendix A) reports 48 requirements, none failing and none uncovered. 43 requirements are implemented in full and 5 partially (FR-14, FR-27, NFR-S3, NFR-S8 and NFR-U1), with the missing part stated in the RTM. Nine requirements, mainly usability and data protection, cannot be fully checked by an automated assertion and were verified by inspection or demonstration, recorded in Table " + doc.peekTable() + ".");
doc.table("Manual verifications", ["Requirement", "Method and evidence"], Object.entries(MANUAL).sort().map(([k, v]) => [k, v]), [18, 82]);
doc.p("In addition, the candidate ran the 16-step Guided Demo by hand on his own Windows laptop on 3 November 2026 and every step passed. This acted as an informal acceptance test on the target development environment, separate from the automated TC-SYS-003.");

doc.h2("Performance and Capacity");
doc.p(`The performance tests measure as well as assert, so the actual figures are recorded (Table ${doc.peekTable()}).`);
doc.table("Measured performance against budgets", ["Test", "Requirement", "Budget", "Measured"], [
  ["TC-CORE-070", "NFR-P1 full offline check (Python)", "3,000 ms", "0.32 ms"],
  ["TC-WEB-013", "NFR-P1 full offline check (browser library)", "3,000 ms", "4.3 ms"],
  ["TC-SVC-040", "NFR-P2 issuance through the API", "5,000 ms", "8 ms"],
  ["TC-CORE-071", "NFR-C3 100,000-entry revocation list", "2 MB", "2.40 MB plain; 0.94 MB compressed"],
  ["TC-WEB-016", "NFR-C3 same list in the phone cache", "2 MB", "1.41 MB"],
  ["TC-WEB-015", "NFR-C2 five wallet profiles", "5 MB", "3.4 KB"],
  ["TC-SVC-041", "NFR-C4 one day of 2,000 records", "One request", "Accepted; chain intact"],
], [18, 40, 16, 26]);
doc.p("The measurements were taken on a test machine, not a low-end phone. A budget-class Android phone may be ten to fifty times slower, which would still leave verification under a quarter of a second against a three-second budget.");

doc.h2("System Test Results");
doc.p(`Both browser system tests passed: TC-SYS-002 with 11 of 11 checks and TC-SYS-003 with 16 of 16 steps. Figure ${doc.peekFig()} shows four screens from TC-SYS-002 during the offline check; the verdict screens for genuine, replayed, edited and revoked credentials are in QRW-SEC-03, Figure 5.1.`);
doc.figure("Offline verification during TC-SYS-002", "../screenshots/distribution-day-flow.png", 16);

doc.h2("Static Analysis, Security Scans and Continuous Integration");
doc.table("Static and dynamic analysis results", ["Check", "Result"], [
  ["Flake8 (Python lint)", "Clean"],
  ["TypeScript strict type-check", "Clean"],
  ["Bandit (Python SAST)", "One low finding triaged as a false positive (B105, OAuth2 token type); one fixed (subprocess with shell=True in a tool)"],
  ["pip-audit", "No known vulnerabilities"],
  ["npm audit (shipped packages)", "react-router-dom advisories found; dependency removed; now 0"],
  ["OWASP ZAP 2.16.1", "Before: 0 High, 1 Medium. After fix: 0 High, 0 Medium, 1 Low accepted"],
], [30, 70]);
doc.p(`The pipeline runs on GitHub were all green at the time of capture, with all four jobs passing on each (Figure ${doc.peekFig()}).`);
doc.figure("GitHub Actions: continuous integration runs, all jobs passing", "../evidence/ci-github-actions-green.png", 15);

// =====================================================================
doc.h1("Defects Found");
doc.p(`Tests are only useful if they find problems. Table ${doc.peekTable()} lists the defects the tests and scans found during development, how each was found and fixed, and the test that now guards against its return.`);
doc.table("Defect log", ["ID", "Found by", "Defect", "Severity", "Fix and regression test"], [
  ["DEF-01", "Manual test by the candidate (3 Nov)", "The scanner trimmed input, removing trailing spaces that are valid Base45 characters, so some genuine codes were rejected as \"not a valid identity code\"", "High", "Keep meaningful spaces, drop only line breaks; clearer messages per code type (4888af3). TC-WEB-010 to 012"],
  ["DEF-02", "TC-CORE-071 (performance)", "A 100,000-entry revocation list was 2.40 MB, over the 2 MB budget", "Medium", "Compression in transit and a packed phone cache (7264652). TC-CORE-071, TC-SVC-042, TC-WEB-016"],
  ["DEF-03", "npm audit", "react-router-dom had open-redirect and cross-site scripting advisories", "High", "Dependency removed; internal router (6758cc8). CI audit gate"],
  ["DEF-04", "OWASP ZAP", "API documentation pages had no Content-Security-Policy", "Medium", "Hash-based policy; docs switch for production (7c44f43). TC-SEC-011, 012"],
  ["DEF-05", "OWASP ZAP re-scan", "First fix still allowed inline styles", "Medium", "Inline styles removed; checked in a browser (7c44f43). TC-SEC-011"],
  ["DEF-06", "Bandit", "A developer tool ran subprocess with shell=True", "Low", "Command resolved without a shell (7264652). Bandit in CI"],
  ["DEF-07", "Candidate's walkthrough (3 Nov)", "Pasting the wrong kind of code into the Verifier gave an unhelpful error", "Low", "Code type recognised and explained (4888af3). TC-WEB-011"],
], [9, 18, 33, 10, 30], { size: 17 });
doc.p("The design also changed as a result of reviewing it before code existed: checking the issuance sequence diagram showed that a re-issue had to revoke the old credential in the same transaction as it saved the new one (decision D8), which is now verified by TC-SVC-023.");

// =====================================================================
doc.h1("Evaluation and Conclusion");
doc.h2("Evaluation");
doc.p("The evidence supports the claim that the prototype meets its requirements, with the stated partial exceptions. The strongest evidence is for the parts that matter most: the verification logic is tested by examples, by properties over generated inputs, and against an independent implementation in another language, and the whole flow is tested offline in real browsers. The tests were not written after the fact to confirm working code; the core was written test-first, and the tests, scans and the candidate's own manual testing found seven real defects, each now guarded by a regression test.");
doc.h2("Limitations");
doc.bullets([
  "No field test on a low-end Android phone in Kura has been done yet; performance figures come from a test machine.",
  "The Playwright system tests are run by hand, not in CI, because they need the services and a built web app running together.",
  "There is no load test of many simultaneous synchronisations.",
  "Usability was checked by inspection and demonstration, not by testing with farmers or agents.",
]);
doc.h2("Conclusion");
doc.p(`${totalTC} test cases at five levels, all passing, with 97% statement coverage of the Python code, full requirement traceability, continuous integration on every push and documented security scans give a high level of confidence in the prototype for an examination system. The most valuable next step in testing is a field trial on the phones and network conditions the system is designed for.`);

doc.save(process.argv[2], [["1.0", "4 Nov 2026", "First complete test plan and test report"]]).then(() => console.log("written", process.argv[2]));
