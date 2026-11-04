const { Doc } = require("./lib");
const S = "../screenshots/";

const doc = new Doc({ code: "QRW-USR-06", title: "User Manual and Installation Guide", version: "1.0", date: "November 2026",
  related: "QRW-SRS-01 Requirements · QRW-SDD-02 Design · QRW-TST-04 Test Plan & Report" });

// =====================================================================
doc.h1("Introduction");
doc.h2("Purpose and Audience");
doc.p("This manual explains how to install, start and use the Offline-First Cryptographic QR Identity Wallet. Part one (Sections 2 to 4) is the installation guide, written for whoever sets the system up: an examiner, a developer or an IT officer. Part two (Sections 5 to 7) is the user guide, organised by role, for the people who use the screens: enrolment officers, farmers, redemption agents, auditors and administrators. Section 8 helps when something goes wrong.");
doc.h2("The System at a Glance");
doc.p("A farmer's identity is issued once, at the LGA office, as a digitally signed QR code kept in a wallet app on the farmer's phone (or printed on paper for farmers without a smartphone). At the fertiliser distribution point the agent's phone checks that code with no network at all: it confirms the signature, asks the farmer's wallet to prove it holds the matching key, checks that the credential is not revoked or expired, and asks the agent to compare the farmer's face with the details shown. Each check is recorded and uploaded to a tamper-evident audit log when the phone next has a signal.");
doc.h2("Roles and Screens");
doc.p(`The web application has one screen per role (Table ${doc.peekTable()}). All screens are in the same application; each device simply opens the screen its user needs.`);
doc.table("Roles and their screens", ["Role", "Screen", "Device", "Network needed"], [
  ["Enrolment officer", "Issuer Portal", "Laptop at the LGA office", "Yes"],
  ["Farmer", "Wallet", "Farmer's phone (can be shared by a family)", "Never"],
  ["Redemption agent", "Verifier", "Agent's phone at the distribution point", "Once a week, to sync"],
  ["Auditor (M&E officer)", "Audit", "Laptop", "Yes"],
  ["Administrator", "API documentation pages", "Laptop", "Yes"],
  ["Examiner or trainer", "Guided Demo", "One laptop or a projector", "Services running locally"],
], [22, 22, 36, 20]);
doc.h2("Conventions");
doc.p("Text you type or commands you run are shown in a shaded box. Buttons and labels on screen are written in quotation marks, for example \"Sign and issue\". All names and NINs used in this manual are fictional.");

// =====================================================================
doc.h1("System Requirements");
doc.table("Requirements for the server laptop", ["Item", "Minimum", "Notes"], [
  ["Operating system", "Windows 10 or 11, macOS, or Linux", "The one-click launcher is for Windows"],
  ["Processor and memory", "Any dual-core laptop, 4 GB RAM", "All five services together use well under 1 GB"],
  ["Disk space", "1 GB free", "Mostly the Node packages"],
  ["Python", "3.11 or newer (3.12 recommended)", "From python.org; tick \"Add Python to PATH\""],
  ["Node.js", "20 LTS or newer", "From nodejs.org; includes npm"],
  ["Git", "Any recent version", "From git-scm.com"],
  ["Docker Desktop", "Optional", "Only for the container option (Section 3.4)"],
], [24, 36, 40]);
doc.table("Requirements for phones", ["Item", "Requirement"], [
  ["Phone", "Android phone with Chrome (a recent version), camera for scanning"],
  ["Connection for setup", "Same Wi-Fi network as the server laptop, to open the app the first time and to sync"],
  ["Connection at the distribution point", "None. The Wallet never needs one; the Verifier needs one only to sync"],
  ["Feature-phone users", "No phone needed: a printed paper wallet (L1) is issued instead"],
], [32, 68]);

// =====================================================================
doc.h1("Installation");
doc.p("The installation is done once. It takes about 10 to 15 minutes, most of it downloading packages.");
doc.h2("Step 1: Install the Tools");
doc.numbered([
  "Install **Python** from python.org. On the first installer screen, tick **\"Add python.exe to PATH\"**.",
  "Install **Node.js** (the LTS version) from nodejs.org, accepting the defaults.",
  "Install **Git** from git-scm.com, accepting the defaults.",
  "Open a new PowerShell window and check each tool answers with a version number:",
]);
doc.code(["python --version", "node --version", "git --version"]);
doc.h2("Step 2: Get the Code");
doc.p("In PowerShell, go to the folder where you keep projects and clone the repository:");
doc.code(["cd $HOME\\Documents", "git clone https://github.com/sarki94/qr-identity-wallet.git", "cd qr-identity-wallet"]);
doc.p("If you received the project as a ZIP file instead, extract it and open PowerShell in the extracted folder.");
doc.h2("Step 3: Install the Python Packages");
doc.p("Create a virtual environment (a private folder of packages for this project), activate it, and install the core library and the services:");
doc.code(["python -m venv .venv", ".venv\\Scripts\\Activate.ps1", "pip install -e ./core -e \"./services[dev]\""]);
doc.p("On Linux or macOS, activate with source .venv/bin/activate instead. If PowerShell refuses to run the activation script, run Set-ExecutionPolicy -Scope CurrentUser RemoteSigned once and try again. When the environment is active, the prompt starts with (.venv).");
doc.h2("Step 4: Install and Build the Web Application");
doc.code(["cd web", "npm install", "npm run build", "cd .."]);
doc.p("The build creates the web/dist folder, which the launcher and the preview server use.");
doc.h2("Alternative: Run the Services with Docker");
doc.p("If Docker Desktop is installed, the five services can be started as containers instead of Steps 3 and 5. A one-off container creates the keys in a shared volume first:");
doc.code(["docker compose up --build"]);
doc.p("The web application is still started with npm as in Section 4.2.");
doc.h2("Configuration");
doc.p(`The services read their settings from environment variables (Table ${doc.peekTable()}). The defaults suit a demonstration on one laptop; the last column shows what to change for any real deployment.`);
doc.table("Configuration settings", ["Variable", "Default", "Meaning", "Production"], [
  ["QRW_KEY_PASSWORD", "dev-only-change-me", "Password that encrypts the private keys on disk", "Set a long secret"],
  ["QRW_SEED_DEMO", "1", "Create the demo accounts on first start", "0"],
  ["QRW_API_DOCS", "1", "Serve the /docs API pages and /openapi.json", "0"],
  ["QRW_CORS_ORIGINS", "localhost:5173 and 127.0.0.1:5173", "Web origins allowed to call the services", "The real app origin"],
  ["QRW_DATA_DIR", "data", "Folder for the SQLite databases", "Use PostgreSQL instead"],
  ["QRW_<SERVICE>_DATABASE_URL", "(SQLite file)", "Database for one service, e.g. QRW_ISSUER_DATABASE_URL", "PostgreSQL URL"],
  ["QRW_SECRETS_DIR", ".secrets", "Folder for keys and the service key", "Protected volume or HSM"],
], [28, 22, 32, 18], { size: 18 });
doc.h2("Demonstration Accounts and Test Data");
doc.p(`On first start the services create the demonstration accounts in Table ${doc.peekTable()}. They exist for examination and training only and are switched off with QRW_SEED_DEMO=0.`);
doc.table("Demonstration accounts", ["Username", "Password", "Role"], [
  ["officer1", "Officer#2026!", "Enrolment officer"],
  ["agent1", "Agent#2026!", "Redemption agent at point KURA-01"],
  ["agent2", "Agent#2026!", "Redemption agent at point KURA-02"],
  ["auditor1", "Auditor#2026!", "Auditor"],
  ["admin", "Admin#2026!", "Administrator"],
], [22, 26, 52]);
doc.p("The mock NIMC service holds six fictional records. Use NIN 12345678901 (Musa Ibrahim, Kura Ward) or 23456789012 (Hauwa Garba); the others are 34567890123, 45678901234, 56789012345 and 67890123456.");

// =====================================================================
doc.h1("Starting and Stopping");
doc.h2("One-Click Start on Windows");
doc.p("Double-click **start-demo.bat** in the project folder. It opens two windows, one running the services and one running the web application (keep both open), and then opens the Guided Demo in the browser at http://localhost:4173/demo. To stop, close the two windows.");
doc.h2("Manual Start (Any Operating System)");
doc.p("Open two terminals in the project folder, with the virtual environment active in the first:");
doc.code(["# Terminal 1: the five services", "python services/scripts/run_local.py", "", "# Terminal 2: the web application", "cd web", "npm run preview"]);
doc.p("Then open http://localhost:4173 in the browser. Stop each terminal with Ctrl+C.");
doc.h2("Using Real Phones");
doc.p("Phones need HTTPS to use the camera and the browser's cryptography, so the web application has a phone mode with a self-signed certificate:");
doc.numbered([
  "Connect the laptop and the phones to the same Wi-Fi network (a phone hotspot works).",
  "Find the laptop's address with ipconfig (Windows) and note the IPv4 address, for example 192.168.0.12.",
  "In Terminal 2 run npm run phone instead of npm run preview.",
  "On each phone open Chrome and go to https://<laptop-address>:4173, for example https://192.168.0.12:4173.",
  "Chrome warns that the connection is not private, because the certificate is self-signed. Tap \"Advanced\" then \"Proceed\". This is needed once per phone for the demonstration; a real deployment uses a proper certificate.",
  "Optionally use Chrome's \"Add to Home screen\" so the app opens like an installed app, even with no network.",
]);
doc.h2("Checking the Installation");
doc.p("Each service answers at /health. With the services running, these addresses should each show \"status\": \"ok\": http://127.0.0.1:8001/health (Auth), 8002 (Issuer), 8003 (Trust), 8004 (Audit) and 8005 (Mock NIMC). For a full check, run the automated tests (Section 9).");

// =====================================================================
doc.h1("Quick Tour: the Guided Demo");
doc.p(`The Guided Demo shows the whole distribution day on one screen, with the officer's laptop, the farmer's phone and the agent's phone side by side (Figure ${doc.peekFig()}). Each press of \"Next step\" performs one real action against the running services, using the same code as the real screens, and explains what happened and which requirements it demonstrates. It is the quickest way to see the system work and is designed for the oral defence.`);
doc.figure("Guided Demo, step 9: the farmer is accepted with the agent offline", S + "demo-step-09.png", 15);
doc.p("The sixteen steps are: the farmer sets up the wallet; the officer looks Musa up at NIMC and issues the credential; the wallet saves it; the agent syncs and then loses the network; Musa presents, answers the challenge and is accepted after the face check; a replayed screenshot and an edited QR are both rejected; the officer revokes Musa's credential after his phone is stolen; the offline agent still accepts it (the honest gap, explained on screen); the agent syncs and uploads; the stolen credential is now refused; and the auditor confirms the audit chain is intact. \"Restart\" begins again.");

// =====================================================================
doc.h1("User Guide by Role");
doc.h2("Enrolment Officer: Issuer Portal");
doc.p("The officer works at the LGA office with a network connection. Open the \"Portal\" tab and sign in with your officer account.");
doc.h3("Enrol a farmer and issue a credential");
doc.numbered([
  "Under \"1 · Enrol farmer\", type the farmer's 11-digit NIN and press \"Look up at NIMC\". The farmer's name, ward and LGA appear. Only a masked NIN is kept (for example 123*****901).",
  "Under \"2 · Issue credential\", choose the level: **\"L2 · smartphone wallet\"** if the farmer has an Android phone, or **\"L1 · paper wallet\"** if not.",
  "For L2, ask the farmer to open the Wallet, create a profile and show the binding code. Scan it with \"Open camera\" (or paste it). The binding code contains only the wallet's public key.",
  "Optionally take or choose a photo. It is stored, small, inside the signed credential and shown to the agent at the face check.",
  "Press \"Sign and issue\". The signed credential QR appears. For L2, the farmer scans it into the wallet; for L1, press \"Print\" and hand over the paper wallet.",
]);
doc.figure("Issuer Portal after issuing a credential", S + "02-portal-issued.png", 11.5, { maxHeightCm: 14 });
doc.p("If the farmer already has an active credential, issuing a new one revokes the old one automatically in the same step, so a farmer never has two valid credentials.");
doc.h3("Revoke a credential");
doc.p("When a phone is lost or stolen, or fraud is suspected, find the farmer's credentials in the list under the issue form, choose the \"Revocation reason\" (lost or stolen phone, death, fraud, possible cloning, other) and press \"Revoke\". The signed revocation list is published to the Trust service at once; agents receive it at their next sync. If the Trust service was unreachable, the portal says so, and \"Republish revocation list\" sends it again.");
doc.h2("Farmer: Wallet");
doc.p(`The Wallet works with no network at any time. One phone can hold several family members, each with their own profile and PIN. Figure ${doc.peekFig()} shows the main screens.`);
doc.figure("Wallet: creating a profile, binding, saving and answering", S + "manual/wallet-steps.png", 16);
doc.h3("Set up (at the LGA office)");
doc.numbered([
  "Open the \"Wallet\" tab and press \"+ New profile\". Type your name and choose a 6-digit PIN, then press \"Create\". A private key is created on the phone and locked with the PIN; it never leaves the phone.",
  "Show the binding code to the officer, then press \"Next: add my credential\".",
  "Scan the credential QR the officer shows (or paste it) and press \"Add credential\". The profile now shows \"Credential saved\".",
]);
doc.h3("Present at the distribution point");
doc.numbered([
  "Press \"Present\" on your profile and enter your PIN. Your credential QR appears; the agent scans it.",
  "Press \"Agent shows a challenge\" and scan the challenge code on the agent's phone.",
  "Your wallet signs an answer. Show it to the agent and press \"Done\" when the agent has scanned it.",
]);
doc.p("Keep your PIN private: it is what stops another family member from using your profile. After five wrong PINs the profile locks for five minutes. If your phone is lost or stolen, report it to the enrolment officer so the credential is revoked.");
doc.h2("Redemption Agent: Verifier");
doc.p(`The Verifier works offline once it has synced. Figure ${doc.peekFig()} shows the steps.`);
doc.figure("Verifier: signing in, ready to scan, holder check and face check", S + "manual/verifier-steps.png", 16);
doc.h3("Before the distribution day (with a signal)");
doc.numbered([
  "Open the \"Verifier\" tab and sign in with your agent account. The sign-in lasts seven days, so you can work offline for a week.",
  "Press \"Sync now\". The phone downloads the issuer keys and the latest revocation list, and uploads any queued records. The card shows the list version, its age and the number of records waiting.",
]);
doc.h3("Checking each farmer (no signal needed)");
doc.numbered([
  "Press \"Open camera\" and scan the farmer's credential QR (wallet or paper). If the camera cannot be used, open \"No camera? Paste the code\".",
  "For a wallet (L2) credential, the phone shows a challenge code: let the farmer's wallet scan it, then scan the answer the wallet shows.",
  "Compare the person in front of you with the photo and details shown, and answer \"Yes, same person\" or \"No\".",
  "Read the verdict, then press \"Next farmer\". Every check, accepted or rejected, is recorded and queued for upload.",
]);
doc.p(`The verdicts and what to do about each are listed in Section 7. Figure ${doc.peekFig()} shows four of them.`);
doc.figure("Verifier verdicts", S + "verifier-verdicts.png", 16);
doc.h3("Keeping the list fresh");
doc.p("Sync whenever you have a signal. If the list is more than 7 days old the Verifier warns you; after 30 days it refuses to accept anyone until you sync, because revoked credentials could otherwise pass.");
doc.h2("Auditor: Audit Screen");
doc.p("Open the \"Audit\" tab and sign in with the auditor account. The top card shows whether the audit chain is intact: every record is linked by hash to the one before it, so any change, deletion or reordering in the database is detected. Below it, the verification records show the time, point, agent, credential, result, level and reason for each check. \"Refresh\" reloads the records.");
doc.figure("Audit screen with an intact chain", S + "14-audit-chain.png", 14);
doc.p("The anomaly report (the same credential checked at two different points within 24 hours) is available from the Audit service at /anomalies.");
doc.h2("Administrator: Staff Accounts");
doc.p("Staff accounts are managed through the Auth service's API documentation page at http://127.0.0.1:8001/docs. Sign in with POST /token to obtain a token, press \"Authorize\" and paste it, then use:");
doc.bullets([
  "**POST /users** to create an account (username, password, role, and for agents the distribution point);",
  "**GET /users** to list accounts;",
  "**PATCH /users/{id}** to disable or re-enable an account, unlock it after five failed logins, or move an agent to another point.",
]);
doc.p("In production the documentation pages are switched off (QRW_API_DOCS=0) and these calls are made from an administration tool.");

// =====================================================================
doc.h1("Verdicts and Messages");
doc.p(`Table ${doc.peekTable()} explains every verdict the Verifier can give and what the agent should do.`);
doc.table("Verifier verdicts and actions", ["Message on screen", "Meaning", "What to do"], [
  ["ACCEPTED (An karɓa)", "Signature, holder, revocation, expiry and face all passed", "Proceed with the distribution"],
  ["The wallet could not prove it holds this credential (copy or replay)", "A screenshot, photocopy or recorded answer was used", "Refuse; ask for the farmer's own phone"],
  ["Not a valid identity code: it is damaged, altered, or from another system", "The QR was edited, damaged or is not ours", "Refuse; refer to the LGA office"],
  ["Signature does not match: the code was altered or forged", "The credential's content was changed", "Refuse; report as possible fraud"],
  ["Credential has been revoked", "The officer withdrew it (lost phone, fraud, death)", "Refuse; refer to the LGA office"],
  ["Credential has expired / is not valid yet", "Outside its validity dates", "Refuse; refer for re-issue"],
  ["Issued by an unknown authority", "Signed by a key the Verifier does not trust", "Refuse; sync if keys may be outdated"],
  ["The agent judged the person does not match", "Face check answered \"No\"", "Refuse; recorded for the auditor"],
  ["That is the wallet's binding code / a challenge code / a wallet answer", "The wrong kind of code was scanned", "Ask the farmer to press \"Present\" and enter the PIN"],
  ["List is N days old", "More than 7 days since the last sync", "Sync as soon as there is a signal"],
  ["Revocation list older than 30 days. Sync before accepting anyone", "Too stale to trust", "Sync before continuing"],
  ["This phone has never synced", "No keys or list yet", "Sync once with a signal"],
], [34, 36, 30], { size: 18 });

// =====================================================================
doc.h1("Troubleshooting");
doc.p("The problems in Table " + doc.peekTable() + " were met during development and testing; each has a known fix.");
doc.table("Troubleshooting", ["Problem", "Cause", "Fix"], [
  ["The .venv folder is missing (launcher message)", "One-time setup not done", "Do Section 3, Steps 3 and 4"],
  ["pip says the requirement is not a valid editable path", "Older pip on Windows", "Use the ./ paths exactly as shown, or install core and services separately"],
  ["Verifier or Portal shows a connection error; the web window shows ECONNREFUSED", "The services are not running", "Start Terminal 1 (or use start-demo.bat) and keep it open"],
  ["The camera does not open on a phone", "The page is not on HTTPS", "Use npm run phone and an https:// address"],
  ["\"Your connection is not private\" on the phone", "Self-signed demo certificate", "Tap Advanced, then Proceed (demo only)"],
  ["\"Account locked\" when signing in", "Five wrong passwords", "Ask the administrator to unlock the account"],
  ["\"Too many requests\"", "More than 20 sign-in attempts in a minute", "Wait one minute"],
  ["Wallet says the profile is locked", "Five wrong PINs", "Wait five minutes"],
  ["Port already in use when starting", "An earlier copy is still running", "Close the old windows or restart the laptop"],
  ["Git asks \"Unlink of file ... failed. Should I try again? (y/n)\"", "Windows file lock during Git housekeeping", "Answer n; run git config gc.auto 0 once"],
  ["PowerShell will not run Activate.ps1", "Script execution policy", "Set-ExecutionPolicy -Scope CurrentUser RemoteSigned"],
], [34, 30, 36], { size: 18 });

// =====================================================================
doc.h1("Running the Tests");
doc.p("With the virtual environment active, from the project folder:");
doc.code([
  "cd core",
  "pytest --cov=qrw_core        # 53 unit and property tests",
  "cd ../services",
  "pytest --cov=qrw_services    # 49 integration, security, E2E",
  "cd ../web",
  "npm run coverage             # 16 browser-library tests",
  "cd ..",
  "python tools/rtm.py          # all suites + regenerate RTM",
]);
doc.p("The browser system tests need the services and the web preview running, and Playwright installed (npm install -g playwright, then npx playwright install chromium):");
doc.code(["cd web", "node e2e/distribution-day.mjs   # TC-SYS-002, 11 checks", "node e2e/guided-demo.mjs        # TC-SYS-003, 16 steps"]);
doc.p("The same Python and browser-library tests, static analysis and dependency scans run automatically on GitHub for every push.");

doc.save(process.argv[2], [["1.0", "4 Nov 2026", "First complete user manual and installation guide"]]).then(() => console.log("written", process.argv[2]));
