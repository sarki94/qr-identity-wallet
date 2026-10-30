# Offline-First Cryptographic QR Identity Wallet

COEN838 Advanced Software Engineering, Question 4 (Ahmadu Bello University, Zaria).

Rural farmers are turned away from subsidised fertiliser distribution when online NIN verification fails for lack of network. This system lets a redemption agent verify a farmer's identity **with no network at all**, using Ed25519-signed credentials carried in a QR code and an offline challenge–response that defeats screenshots and photocopies.

## Repository layout

| Path | What it is |
|---|---|
| `core/` | `qrw_core`: the cryptographic core (credential signing and verification, QR encoding, challenge–response, revocation list, audit hash chain). Pure Python, fully unit- and property-tested. |
| `docs/uml/` | UML models as PlantUML source (use case, sequence, class, state machine). |
| `.github/workflows/ci.yml` | CI: Flake8, Bandit (SAST), pytest + Hypothesis with a 90% coverage gate. |

Services (Auth, Issuer, Trust & Revocation, Audit & Sync, Mock NIMC) and the PWA clients (Wallet, Verifier, Issuer Portal) are added in later sprints.

## Run the core tests

```bash
cd core
python -m venv .venv
# Windows: .venv\Scripts\activate    Linux/macOS: source .venv/bin/activate
pip install -e ".[dev]"
pytest --cov=qrw_core
flake8 qrw_core tests
bandit -r qrw_core
```

## Test strategy (summary)

Test-driven development: every module's tests were committed failing before the implementation (see the `test(core): ... (TDD red)` and `feat(core): ... (TDD green)` commits). Each test is named with a test-case ID (`tc_core_NNN`) and tagged with the requirement IDs it verifies (`@pytest.mark.req("FR-16", "NFR-S5")`), so the Requirements Traceability Matrix can be generated from the code.

Property-based tests (Hypothesis) prove security properties over many random inputs, for example: *flipping any single bit of a credential or its signature always causes rejection*, and *any arbitrary text fed to the QR decoder is rejected cleanly, never crashing the verifier*.

## AI use statement

This project was developed with AI assistance (Claude), used for design discussion, code drafting and review. All design decisions, field evidence and final content were directed and verified by the author. Commits made with AI assistance carry a `Co-Authored-By` trailer.
