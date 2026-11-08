const fs = require("fs");
const path = require("path");
const { Doc } = require("./lib");
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "prm_data.json"), "utf8"));

const pL = (p) => (p < 0.25 ? 0 : p <= 0.5 ? 1 : 2), iL = (l) => (l < 2 ? 0 : l <= 7 ? 1 : 2);
const tier = (p, l) => { const s = (pL(p) + 1) * (iL(l) + 1); return s <= 2 ? "Green" : s <= 4 ? "Yellow" : "Red"; };
const risks = D.risks.map(([id, cat, text, p, l, mit, status]) => ({ id, cat, text, p, l, re: +(p * l).toFixed(2), mit, status, tier: tier(p, l) }));
const ranked = [...risks].sort((a, b) => b.re - a.re);
const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));

const doc = new Doc({ code: "QRW-PRM-05", title: "Project, Risk and Maintenance Plan", version: "1.1", date: "November 2026",
  related: "QRW-SRS-01 Requirements · QRW-SEC-03 Security · QRW-TST-04 Test Plan & Report" });

// =====================================================================
doc.h1("Introduction");
doc.h2("Purpose");
doc.p("This document covers the management side of the project. It describes the development process and how the work was planned and tracked; reports the delivery metrics (earned value, burndown, velocity, technical debt and an effort estimate); presents the risk register for the project and the product; and sets out the maintenance plan that classifies the changes the system is expected to need after delivery as corrective, adaptive, perfective or preventive.");
doc.h2("References");
doc.references([
  "Boehm, B. W. (1981). *Software engineering economics*. Prentice Hall.",
  "Boehm, B. W. (1991). Software risk management: Principles and practices. *IEEE Software, 8*(1), 32–41. https://doi.org/10.1109/52.62930",
  "Lientz, B. P., & Swanson, E. B. (1980). *Software maintenance management*. Addison-Wesley.",
  "Project Management Institute. (2021). *A guide to the project management body of knowledge (PMBOK guide)* (7th ed.). Project Management Institute.",
  "Sommerville, I. (2016). *Software engineering* (10th ed.). Pearson.",
]);

// =====================================================================
doc.h1("Project Management");
doc.h2("Process Model");
doc.p("The project followed an incremental, time-boxed process with daily sprints, combined with test-driven development for the security-critical core. Requirements, elicitation and the UML models were produced first, because the design rests on them; implementation then proceeded in increments that each ended with a working, tested build: the core library, the services, the web application, security hardening, then the documents. A plan-driven waterfall was rejected because the deadline was fixed and the risk of finding a design problem late (for example in how the browser and Python agree on signatures) was high; short increments with continuous integration exposed such problems on the day they appeared.");
doc.p("Because this is a solo project, the agile ceremonies were reduced to what adds value for one person: a written sprint plan with a definition of done for each day, a scope cut list agreed in advance, a daily earned-value check against the baseline, and a decision log recording every significant design decision with its reason.");
doc.h2("Work Breakdown and Estimates");
doc.p(`The work was broken into packages estimated in story points, where one point is roughly one focused hour (Table ${doc.peekTable()}). The total, the budget at completion (BAC), is ${D.bac} points.`);
doc.table("Work packages", ["Package", "Content", "Points", "Status on 8 Nov"], [
  ["WP1", "Core cryptographic library, test-first, and CI pipeline", "8", "Done 30 Oct"],
  ["WP2", "Five back-end services with integration tests", "16", "Done 3 Nov"],
  ["WP3", "Web application: Verifier, Wallet, Issuer Portal, Audit, Guided Demo", "16", "Done 3 Nov (Guided Demo that evening)"],
  ["WP4", "Security testing, hardening and generated RTM", "6", "Done 3 Nov"],
  ["WP5", "Candidate's laptop setup and first push; CI green on GitHub", "2", "Done 3 Nov"],
  ["WP6", "OWASP ZAP scan, STRIDE table, RTM from test tags; field check on target phones", "8", "5 of 8: field check moved to the pilot"],
  ["WP7", "Documentation: SRS, design, security, test, project plan, user manual, technical report", "8", "Done 6 Nov"],
  ["WP8", "Slides, rehearsal and packaging", "4", "3 of 4: slides and packaging done 8 Nov; rehearsal before the defence"],
  ["**Total (BAC)**", "", `**${D.bac}**`, "**64 earned (8 Nov)**"],
], [10, 50, 10, 30]);
doc.h2("Scope Management");
doc.p("A cut list was agreed at the start, so that falling behind would cut the least valuable features in a known order rather than in a panic. It was used once: when the earned value fell behind (SPI 0.25 on 2 November), in the re-plan of 3 November multi-factor authentication for staff was cut and the Hausa translation was limited to the verification verdicts. Some items were never to be cut: offline verification, challenge–response, revocation, the audit chain, the tests and CI. The cut items are recorded as Partial requirements in the RTM and as perfective maintenance in Section 5.");
doc.h2("Tools");
doc.p("Git and GitHub for version control; GitHub Actions for continuous integration; the decision log, sprint plan and requirements kept as Markdown in the repository and the project workspace; generated documents rebuilt from the repository so that figures, requirements and test results cannot drift apart.");

// =====================================================================
doc.h1("Delivery Metrics");
doc.h2("Earned Value");
doc.p("Progress was tracked with earned value management (Project Management Institute, 2021). Planned value (PV) is the cumulative number of points the baseline schedule says should be done by a date; earned value (EV) is the cumulative points of work actually completed, credited only when a package's definition of done is met (partly done packages are credited for their completed sub-deliverables). The schedule performance index is SPI = EV / PV, and the schedule variance is SV = EV − PV.");
const evRows = D.dates.map((d, i) => [d, String(D.pv[i]), D.ev[i] == null ? "–" : String(D.ev[i]),
  D.ev[i] == null ? "–" : (D.ev[i] / D.pv[i]).toFixed(2), D.ev[i] == null ? "–" : String(D.ev[i] - D.pv[i])]);
const notes = ["Core library and CI on plan", "No sprint work (other commitments)", "", "SPI at its lowest; corrective action", "Services and web app delivered in one day", "Security, ZAP scan, Guided Demo, four documents; ahead of plan", "No sprint work", "All seven documents complete", "No sprint work", "Slides and packaging; independent-review fixes (unplanned)"];
doc.table("Earned value by day (story points)", ["Date", "PV", "EV", "SPI", "SV", "Note"], evRows.map((r, i) => [...r, notes[i]]), [12, 9, 9, 9, 9, 52]);
doc.p("The SPI fell to 0.25 on 2 November, when three planned days passed with no sprint work. The corrective action was to re-plan the remaining days, apply the cut list early, and pull work forward: the web application and the security testing, planned for later days, were delivered on 3 November together with the services. SPI recovered to 0.90 that evening and reached 1.02 on 4 November, ahead of plan. At submission on 8 November the SPI is 0.94: of the four points not earned, three are the field check on target phones, moved to the field pilot (Section 5), and one is the rehearsal, scheduled before the defence. The fixes made on 8 November after an independent review (signed audit records and an automated list-age test) were unplanned work and are not counted as earned value.");
doc.p("The cost performance index (CPI = EV / AC) was not computed. It needs the actual cost of the work, and as an unpaid solo project the hours spent were not logged separately from other study; reporting a CPI would mean inventing the denominator.");
doc.h2("Burndown");
doc.p(`Figure ${doc.peekFig()} shows the same data as a burndown chart: the points remaining against the plan. The flat section from 31 October to 2 November is the slip; the steep fall on 3 November is the catch-up.`);
doc.figure("Burndown: planned and actual story points remaining", "figures/burndown.png", 15.5);
doc.h2("Velocity");
doc.p("Velocity is the number of points completed per working day. On the five working days it was 8 (30 October), 28 (3 November), 21 (4 November), 4 (6 November) and 3 (8 November), about 13 points per working day on average. The high figures on 3 and 4 November are the catch-up after the slip; the small later figures are documentation and presentation work, plus review fixes that were not in the plan. The course recommends reserving 15 to 20% of each sprint for refactoring; in practice the refactoring here was done inside the red–green–refactor cycle and in the regenerated documents rather than as a separate allocation.");
doc.h2("Technical Debt Ratio");
doc.p(`The technical debt ratio (TDR) compares the cost of fixing known shortcuts with the cost of building the system: TDR = remediation cost / development cost. Development cost is estimated with the convention used by SonarQube, 30 minutes per line of code; the production code has about 2,400 non-blank, non-comment lines, giving about 1,200 hours. The known debt items, with their estimated remediation effort, are in Table ${doc.peekTable()}.`);
const debt = [
  ["Upgrade Vite 5 and Vitest 2 to current major versions (development-tool advisories)", 4],
  ["Move CI actions off Node 20, which GitHub runners are retiring", 1],
  ["Cache the signed revocation list and re-verify it on every load", 3],
  ["Store the farmer's signed challenge answer in the audit record", 2],
  ["Run the Playwright system tests in CI", 4],
  ["Unit tests for the browser network client, storage helper and router", 4],
  ["Move the login rate limiter to a shared store for multiple instances", 3],
  ["Agent PIN unlock for the seven-day offline token", 6],
];
const debtHours = debt.reduce((s, d) => s + d[1], 0);
doc.table("Known technical debt", ["Item", "Remediation (hours)"], debt.map(([a, b]) => [a, String(b)]).concat([["**Total**", `**${debtHours}**`]]), [80, 20]);
doc.p(`TDR = ${debtHours} / 1,200 ≈ ${(debtHours / 12).toFixed(1)}%. This is within the 5% band that SonarQube rates A. The figure is only as good as the list behind it, which is why each item is also a scheduled maintenance task in Section 5.`);
doc.h2("Effort Estimate with COCOMO");
doc.p("For comparison, the basic COCOMO model for an organic project (Boehm, 1981) estimates effort as E = 2.4 × KLOC^1.05 person-months and schedule as T = 2.5 × E^0.38 months. For 2.4 KLOC this gives E ≈ 6.0 person-months and T ≈ 4.9 months. The actual development took a few working days of one person. The gap is expected and worth explaining rather than hiding: COCOMO was calibrated on projects of the 1970s and 1980s, and this project reuses mature libraries for all the cryptography and web framework code, generates its documents from the code, and was developed with an AI assistant (see the AI-use statement in the technical report, QRW-TR-07). COCOMO remains useful as an upper bound for planning a production version, where field trials, integration with NIMC and organisational work would dominate.");
doc.h2("Quality Metrics");
doc.table("Quality metrics on 8 November 2026", ["Metric", "Value"], [
  ["Automated test cases / checks", "98 / 149, all passing"],
  ["Statement coverage", "Core 97%; services 97%; browser verifier 90%"],
  ["Requirements covered by a passing test or manual verification", "48 of 48"],
  ["Defects found during development / open", "8 / 0"],
  ["Defect density found before delivery", "About 3.3 per KLOC (8 / 2.4)"],
  ["Static analysis and dependency findings open", "0"],
  ["Dynamic scan findings open (High / Medium)", "0 / 0"],
], [60, 40]);

// =====================================================================
doc.h1("Risk Management");
doc.h2("Process");
doc.p("Risks were managed in the four-step cycle taught in the course: identification, analysis, planning and monitoring (Boehm, 1991). Risks were identified from the problem statement, the elicitation findings, the STRIDE threat model and the schedule. Each was analysed by estimating its probability P(risk) between 0 and 1 and its loss L(risk). Following the course, the risk exposure is RE = P(risk) × L(risk). Loss is measured in person-days of effort to recover, so that project and product risks can be compared on one scale; for product risks this is the effort to investigate an incident, re-issue credentials or rework the system. Each risk was then given a mitigation (to reduce P or L) and a contingency, and was reviewed at each daily earned-value check.");
doc.p("The qualitative rating places each risk in a three-by-three matrix of probability (Low below 0.25, Medium 0.25 to 0.5, High above 0.5) and impact (Low below 2 person-days, Medium 2 to 7, High above 7). The product of the two levels gives the tier: Green (1 to 2), Yellow (3 to 4) or Red (6 to 9).");
doc.h2("Risk Register");
doc.p(`Table ${doc.peekTable()} lists the eleven risks ranked by exposure; Table ${doc.section}.${(doc.tableNo[doc.section] || 0) + 2} gives the mitigation and current status of each.`);
doc.table("Risk register ranked by exposure", ["ID", "Type", "Risk", "P", "L (days)", "RE", "Tier"],
  ranked.map((r) => [r.id, r.cat, r.text, fmt(r.p), String(r.l), fmt(r.re), r.tier]), [9, 10, 45, 8, 10, 8, 10], { size: 17 });
doc.table("Risk mitigation and status", ["ID", "Mitigation and contingency", "Status"],
  ranked.map((r) => [r.id, r.mit, r.status]), [9, 66, 25], { size: 17 });
doc.h2("Risk Matrix");
doc.p(`Figure ${doc.peekFig()} places the risks on the matrix. No risk is in the Red tier. Most sit in the Medium–Medium cell; two low-probability, high-impact product risks (signing-key theft and data-protection non-compliance) are Yellow because of their impact and would be the first to address before a real rollout.`);
doc.figure("Risk matrix (probability × impact)", "figures/risk-matrix.png", 12);
doc.h2("Discussion of the Main Risks");
doc.p("**Schedule slip (PR-1)** shares the highest exposure and is the only risk that already occurred: the SPI fell to 0.25. The mitigations worked as planned (the cut list, pulling work forward, and generating documents from the code) and the SPI recovered to 1.02 by 4 November (0.94 at submission). **Signing-key theft (PD-2)** has a low probability but the largest loss, because every credential would have to be re-issued; the design limits it by keeping the key in one service, and the key identifier in every credential makes rotation possible. **Data-protection non-compliance (PD-6)** is addressed by design through minimisation, but a real rollout also needs a data protection impact assessment and a recorded consent procedure, which are organisational rather than software tasks. **Revocation lag (PD-1)** is the inherent cost of verifying offline; it is bounded by the list-age rules and is accepted as a residual risk, explained in QRW-SEC-03.");

// =====================================================================
doc.h1("Maintenance Plan");
doc.h2("Maintenance Model");
doc.p("After delivery, changes are expected in all four classes defined by Lientz and Swanson (1980) and used in the course. Corrective maintenance fixes faults; adaptive maintenance keeps the system working as its environment changes; perfective maintenance improves it in response to users; and preventive maintenance removes latent faults before they cause failures. Each anticipated change below is classified, prioritised and estimated, so that the plan can be scheduled rather than handled only when something breaks.");
doc.h2("Anticipated Changes");
const M = [
  ["Corrective", "Fix any fault reported from field use, starting with a failing test that reproduces it", "Bug report or failed check", "High", "As needed"],
  ["Adaptive", "Move GitHub Actions jobs off Node 20 (deprecation warnings already shown on the runners)", "Runner deprecation", "High", "1 h"],
  ["Adaptive", "Upgrade Vite 5 to the current major and Vitest 2 to the current major; re-run the dependency audit", "Development-tool advisories", "Medium", "4 h"],
  ["Adaptive", "Replace the mock NIMC with the real NIMC interface when access is granted", "NIMC agreement", "High", "3 days"],
  ["Adaptive", "Move from SQLite to PostgreSQL and the issuer key to an HSM for production", "Production rollout", "High", "3 days"],
  ["Adaptive", "Track changes in Android browsers and Nigeria Data Protection Commission guidance", "Annual review", "Medium", "1 day/year"],
  ["Perfective", "Multi-factor authentication for Admin and Auditor accounts", "Cut list item", "High", "1 day"],
  ["Perfective", "Full Hausa translation of every screen", "Cut list item; user need", "High", "4 h + review"],
  ["Perfective", "Agent PIN unlock for the seven-day offline token", "Partial FR-14", "Medium", "6 h"],
  ["Perfective", "Delta revocation lists small enough for SMS or USSD", "Reduce revocation lag (PD-1)", "Medium", "3 days"],
  ["Perfective", "Store the signed challenge answer in the audit record (non-repudiation)", "STRIDE R2", "Medium", "2 h"],
  ["Perfective", "Anomaly report screen and an improved printed paper wallet layout", "User feedback", "Low", "1 day"],
  ["Preventive", "Cache the signed revocation list and re-verify it on load", "Residual risk (QRW-SEC-03)", "High", "3 h"],
  ["Preventive", "Run the Playwright system tests and the ZAP scan in CI", "Testing limitation", "Medium", "1 day"],
  ["Preventive", "Unit tests for the browser network client, storage helper and router", "Coverage gap", "Medium", "4 h"],
  ["Preventive", "Automated dependency update pull requests (for example Dependabot)", "Supply-chain hygiene", "Medium", "1 h"],
  ["Preventive", "Key-rotation drill and mutual TLS between services", "PD-2; multi-host deployment", "Medium", "2 days"],
];
doc.table("Maintenance plan by class", ["Class", "Change", "Trigger", "Priority", "Effort"], M, [13, 47, 18, 10, 12], { size: 17 });
doc.h2("Maintenance Process");
doc.p("Every change, whatever its class, follows the same steps, reusing the engineering infrastructure built for development:");
doc.numbered([
  "**Request.** Record the change as a GitHub issue with its class and priority.",
  "**Impact analysis.** Use the RTM to find the requirements, design elements and tests the change touches.",
  "**Change test-first.** Write or update the failing test, then the code, then refactor.",
  "**Regression.** CI runs all tests, coverage gates, static analysis and dependency scans; the change cannot merge if any fails.",
  "**Release and record.** Regenerate the RTM and documents, tag the release, and update the decision log if the design changed.",
]);
doc.h2("Schedule and Effort Allocation");
doc.p("In the first month after submission: the adaptive CI and tooling upgrades and the high-priority preventive item (re-verifying the cached list). Before any pilot: multi-factor authentication, full Hausa, the real NIMC interface, PostgreSQL and an HSM. During a pilot: delta revocation lists and improvements from field feedback. Following the course guidance, 15 to 20% of each maintenance cycle is reserved for preventive work and refactoring, so that the technical debt ratio stays below 5%.");

doc.h1("Summary");
doc.p("The project was run as short, test-driven increments with a written plan, a cut list and daily earned-value tracking. When the schedule slipped (SPI 0.25), the plan was corrected and the SPI recovered to 1.02 by 4 November; it stands at 0.94 at submission, with the field check on target phones moved to the pilot. Eleven project and product risks are registered with their exposure, mitigation and status; none is in the Red tier. The maintenance plan anticipates seventeen changes across all four classes, each with a trigger, priority and effort, and a single process that keeps every change tested and traceable.");

doc.save(process.argv[2], [["1.0", "4 Nov 2026", "First complete project, risk and maintenance plan"], ["1.1", "8 Nov 2026", "Status at submission; earned value to 8 November"]]).then(() => console.log("written", process.argv[2]));
