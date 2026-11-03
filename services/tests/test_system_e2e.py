"""System test: the full Kura distribution-day scenario across all five services."""
import uuid
from datetime import date, datetime, timezone

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from qrw_core.challenge import new_challenge, sign_challenge, verify_challenge_response
from qrw_core.credential import Reason, verify_credential
from qrw_core.keys import public_key_b64
from qrw_core.qr import decode_qr
from test_issuer_trust import revoked_ids, trusted_keys


@pytest.mark.req("FR-01", "FR-03", "FR-04", "FR-07", "FR-15", "FR-16", "FR-17", "FR-18", "FR-22", "FR-24", "FR-25")
def test_tc_sys_001_distribution_day_end_to_end(system, tokens):
    s = system
    # Office (online): Musa's wallet makes a device key; the officer enrols him and issues an L2 credential.
    wallet_key = Ed25519PrivateKey.generate()
    farmer = s["issuer"].post("/enrolments", json={"nin": "12345678901"}, headers=tokens["officer1"]).json()
    cred = s["issuer"].post("/credentials", headers=tokens["officer1"], json={
        "farmer_id": farmer["id"], "level": "L2", "holder_public_key": public_key_b64(wallet_key.public_key())}).json()

    # Distribution point syncs while it has signal, then goes offline.
    keys, revoked = trusted_keys(s["trust"]), revoked_ids(s["trust"])
    queue = []

    def verify_at_point(qr_text, responder):
        signed = decode_qr(qr_text)
        result = verify_credential(signed, keys, revoked, date.today())
        ok = result.accepted
        if ok:
            nonce = new_challenge()
            ok = verify_challenge_response(result.payload.holder_public_key, nonce, result.payload.credential_id,
                                           responder(nonce, result.payload.credential_id))
        queue.append({"record_id": uuid.uuid4().hex, "credential_id": cred["id"],
                      "result": "accepted" if ok else "rejected", "level": "L2",
                      "verified_at": datetime.now(timezone.utc).isoformat()})
        return ok, result

    ok, _ = verify_at_point(cred["qr_text"], lambda n, c: sign_challenge(wallet_key, n, c))
    assert ok, "genuine farmer accepted offline"
    screenshot_ok, _ = verify_at_point(cred["qr_text"], lambda n, c: sign_challenge(Ed25519PrivateKey.generate(), n, c))
    assert not screenshot_ok, "screenshot without the device key is rejected"

    # Office revokes (stolen phone); the point only learns after its next sync.
    s["issuer"].post(f"/credentials/{cred['id']}/revoke", json={"reason": "lost_device"}, headers=tokens["officer1"])
    stale_ok, _ = verify_at_point(cred["qr_text"], lambda n, c: sign_challenge(wallet_key, n, c))
    assert stale_ok, "known limitation: offline point still accepts until it syncs"
    revoked = revoked_ids(s["trust"])
    after_ok, result = verify_at_point(cred["qr_text"], lambda n, c: sign_challenge(wallet_key, n, c))
    assert not after_ok and Reason.REVOKED in result.reasons

    # Signal returns: the queue uploads and the auditor sees an intact chain.
    up = s["audit"].post("/records", json=queue, headers=tokens["agent1"]).json()
    assert up["accepted"] == 4
    chain = s["audit"].get("/records/verify-chain", headers=tokens["auditor1"]).json()
    assert chain == {"records": 4, "intact": True, "first_broken_seq": None, "head_hash": up["head_hash"]}
