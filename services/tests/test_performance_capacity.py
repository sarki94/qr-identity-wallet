"""Service-level performance and capacity (NFR-P2, NFR-C4)."""
import time
import uuid
from datetime import datetime, timezone

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from qrw_core.keys import public_key_b64


@pytest.mark.req("NFR-P2", "FR-03")
def test_tc_svc_040_issuance_completes_within_five_seconds(system, tokens):
    fid = system["issuer"].post("/enrolments", json={"nin": "34567890123"}, headers=tokens["officer1"]).json()["id"]
    start = time.perf_counter()
    holder = public_key_b64(Ed25519PrivateKey.generate().public_key())
    r = system["issuer"].post("/credentials", headers=tokens["officer1"], json={
        "farmer_id": fid, "level": "L2", "holder_public_key": holder})
    elapsed = time.perf_counter() - start
    print(f"\nNFR-P2: issuance took {elapsed * 1000:.0f} ms (budget 5000 ms)")
    assert r.status_code == 201 and elapsed < 5


@pytest.mark.req("NFR-C4", "FR-24")
def test_tc_svc_041_a_full_day_of_2000_records_uploads_in_one_batch(system, tokens):
    now = datetime.now(timezone.utc).isoformat()
    batch = [{"record_id": uuid.uuid4().hex, "credential_id": f"cred-{i}", "result": "accepted", "level": "L2",
              "verified_at": now} for i in range(2000)]
    r = system["audit"].post("/records", json=batch, headers=tokens["agent1"])
    assert r.status_code == 200 and r.json()["accepted"] == 2000
    assert system["audit"].get("/records/verify-chain", headers=tokens["auditor1"]).json()["intact"]


@pytest.mark.req("NFR-C3", "FR-15")
def test_tc_svc_042_large_revocation_list_is_served_compressed(system, settings):
    import secrets
    from qrw_core.encoding import b64url_encode
    from qrw_core.keys import load_private_key
    from qrw_core.revocation import sign_revocation_list
    key = load_private_key(settings.secrets_dir / "issuer_private.pem", settings.key_password)
    signed = sign_revocation_list(50, [f"cred-{secrets.token_hex(8)}" for _ in range(20_000)], key)
    body = {"payload_b64": b64url_encode(signed.payload_bytes), "signature_b64": b64url_encode(signed.signature)}
    assert system["trust"].put("/internal/revocations", json=body,
                               headers={"X-Service-Key": settings.secret("service.key").decode()}).status_code == 200
    r = system["trust"].get("/revocations", headers={"Accept-Encoding": "gzip"})
    assert r.status_code == 200 and r.headers.get("content-encoding") == "gzip"
