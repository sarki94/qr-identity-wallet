# Offline-First Cryptographic QR Identity Wallet

COEN838 Advanced Software Engineering, Question 4 (Ahmadu Bello University, Zaria).

Rural farmers are turned away from subsidised fertiliser distribution when online NIN verification fails for lack of network. This system lets a redemption agent verify a farmer's identity **with no network at all**, using Ed25519-signed credentials carried in a QR code and an offline challenge–response that defeats screenshots and photocopies.

## Repository layout

| Path | What it is |
|---|---|
| `core/` | `qrw_core`: the cryptographic core (credential signing and verification, QR encoding, challenge–response, revocation list, audit hash chain). Pure Python, fully unit- and property-tested. |
| `services/` | Five FastAPI services, each with its own database: **Auth** (8001), **Issuer** (8002), **Trust & Revocation** (8003), **Audit & Sync** (8004), **Mock NIMC** (8005). |
| `web/` | One offline-first PWA (React + TypeScript) with four screens: **Verifier** (agent), **Wallet** (farmer), **Issuer Portal** (officer), **Audit** (M&E). Verification runs entirely in the browser. |
| `docs/screenshots/` | Screens captured by the automated browser system test (`web/e2e/distribution-day.mjs`). |
| `docs/uml/` | UML models as PlantUML source (use case, sequence, class, state machine). |
| `docs/evidence/` | Security-testing evidence (Bandit reports before and after triage). |
| `docs/api-demo.http` | Click-to-run API walkthrough for VS Code's REST Client. |
| `.github/workflows/ci.yml` | CI: Flake8, Bandit (SAST), pytest + Hypothesis with a 90% coverage gate, Docker build. |

## Set up (once)

From the repository root:

```bash
python -m venv .venv
# Windows: .venv\Scripts\Activate.ps1    Linux/macOS: source .venv/bin/activate
pip install -e ./core -e "./services[dev]"
```

## Run the tests

```bash
cd core
pytest --cov=qrw_core        # 50 tests
flake8 qrw_core tests
bandit -r qrw_core
cd ../services
pytest --cov=qrw_services    # 22 tests, including the end-to-end system test
```

## Quick start: the Guided Demo (Windows)

After the one-time setup below, **double-click `start-demo.bat`**. It opens two windows (services and web app; keep both open) and then the **Guided Demo** at http://localhost:4173/demo: all three devices (officer, farmer, agent) on one screen, driven by a **Next step** button. Each step runs a real action against the live services with the same verification code as the phone screens, and shows which requirements it proves. Close the two windows to stop.

## Run the services

**Without Docker (any OS), from the repository root:**
```bash
python services/scripts/run_local.py
```
**With Docker:** `docker compose up --build`

Then open http://127.0.0.1:8002/docs for the Issuer API (each service has its own `/docs`).

Demo accounts (prototype only; disable with `QRW_SEED_DEMO=0`):

| Username | Password | Role |
|---|---|---|
| admin | Admin#2026! | Admin |
| officer1 | Officer#2026! | Enrolment Officer |
| agent1 / agent2 | Agent#2026! | Redemption Agent (points KURA-01 / KURA-02) |
| auditor1 | Auditor#2026! | Auditor |

Mock NIMC test NINs (fictional): 12345678901 (Musa Ibrahim), 23456789012 (Hauwa Garba), 34567890123, 45678901234, 56789012345, 67890123456.

## Run the web app

Start the services first (above), then in a second terminal:

```bash
cd web
npm install
npm run build
npm run preview        # http://localhost:4173 on this computer
```

**On phones (same Wi-Fi as the laptop):** run `npm run phone` instead and open `https://<laptop-IP>:4173` on each phone. Accept the certificate warning once (self-signed, for the demo). HTTPS is required for the camera and Web Crypto. Find the laptop IP with `ipconfig` (Windows).

Web tests: `npx vitest run` (cross-language vectors). Browser system test: `node e2e/distribution-day.mjs` with services and preview running (needs Playwright).

## Test strategy (summary)

Test-driven development for the cryptographic core: its tests were committed failing before the implementation (see the `test(core): ... (TDD red)` and `feat(core): ... (TDD green)` commits). The services were tested at API, integration and system level alongside development. Each test is named with a test-case ID (`tc_core_NNN`, `tc_svc_NNN`, `tc_sys_NNN`) and tagged with the requirement IDs it verifies (`@pytest.mark.req("FR-16", "NFR-S5")`), so the Requirements Traceability Matrix can be generated from the code.

Property-based tests (Hypothesis) prove security properties over many random inputs, for example: *flipping any single bit of a credential or its signature always causes rejection*, and *any arbitrary text fed to the QR decoder is rejected cleanly, never crashing the verifier*.

## AI use statement

This project was developed with AI assistance (Claude), used for design discussion, code drafting and review. All design decisions, field evidence and final content were directed and verified by the author. Commits made with AI assistance carry a `Co-Authored-By` trailer.
