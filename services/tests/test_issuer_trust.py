"""Issuer and Trust services (FR-01 to FR-09, FR-18, D8, NFR-S4, NFR-S5)."""
from datetime import date

import httpx
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from qrw_core.credential import Reason, verify_credential
from qrw_core.encoding import b64url_decode, b64url_encode
from qrw_core.keys import load_public_key_b64, public_key_b64
from qrw_core.qr import decode_qr
from qrw_core.revocation import SignedRevocationList, sign_revocation_list, verify_revocation_list


def trusted_keys(trust):
    return {k["kid"]: load_public_key_b64(k["public_key"]) for k in trust.get("/keys").json()["keys"]}


def revoked_ids(trust):
    body = trust.get("/revocations").json()
    signed = SignedRevocationList(b64url_decode(body["payload_b64"]), b64url_decode(body["signature_b64"]))
    return set(verify_revocation_list(signed, trusted_keys(trust)).revoked_ids)


def enrol(system, tokens, nin="12345678901"):
    r = system["issuer"].post("/enrolments", json={"nin": nin}, headers=tokens["officer1"])
    assert r.status_code == 200, r.text
    return r.json()


def issue(system, tokens, farmer_id, level="L2", holder=None):
    holder = holder or Ed25519PrivateKey.generate()
    body = {"farmer_id": farmer_id, "level": level}
    if level == "L2":
        body["holder_public_key"] = public_key_b64(holder.public_key())
    return system["issuer"].post("/credentials", json=body, headers=tokens["officer1"])


@pytest.mark.req("FR-01", "NFR-S4")
def test_tc_svc_020_enrolment_uses_nimc_and_stores_only_masked_nin(system, tokens):
    farmer = enrol(system, tokens)
    assert farmer["name"] == "Musa Ibrahim" and farmer["nin_masked"] == "123*****901"
    assert "12345678901" not in str(farmer)
    assert system["issuer"].post("/enrolments", json={"nin": "99999999999"},
                                 headers=tokens["officer1"]).status_code == 404


@pytest.mark.req("FR-03", "FR-04", "FR-08", "FR-16")
def test_tc_svc_021_issued_l2_credential_verifies_with_published_keys(system, tokens):
    r = issue(system, tokens, enrol(system, tokens)["id"])
    assert r.status_code == 201
    result = verify_credential(decode_qr(r.json()["qr_text"]), trusted_keys(system["trust"]), set(), date.today())
    assert result.accepted and result.payload.level == "L2" and result.payload.lga == "Kura"


@pytest.mark.req("FR-05", "FR-04")
def test_tc_svc_022_paper_wallet_and_key_rules(system, tokens):
    fid = enrol(system, tokens)["id"]
    l1 = issue(system, tokens, fid, level="L1")
    assert l1.status_code == 201 and l1.json()["level"] == "L1"
    bad = system["issuer"].post("/credentials", headers=tokens["officer1"],
                                json={"farmer_id": fid, "level": "L2", "holder_public_key": "AAAA"})
    assert bad.status_code == 422
    stray_key = public_key_b64(Ed25519PrivateKey.generate().public_key())
    l1_with_key = system["issuer"].post("/credentials", headers=tokens["officer1"], json={
        "farmer_id": fid, "level": "L1", "holder_public_key": stray_key})
    assert l1_with_key.status_code == 422


@pytest.mark.req("FR-06", "FR-09")
def test_tc_svc_023_reissue_is_atomic_and_revokes_old_credential(system, tokens):
    fid = enrol(system, tokens)["id"]
    first = issue(system, tokens, fid).json()
    second = issue(system, tokens, fid).json()
    creds = system["issuer"].get(f"/farmers/{fid}/credentials", headers=tokens["officer1"]).json()
    statuses = {c["id"]: c["status"] for c in creds}
    assert statuses == {first["id"]: "Revoked", second["id"]: "Active"}
    assert second["published"] and first["id"] in revoked_ids(system["trust"])


@pytest.mark.req("FR-07", "FR-09", "FR-18")
def test_tc_svc_024_revoked_credential_fails_offline_verification_after_sync(system, tokens):
    cred = issue(system, tokens, enrol(system, tokens)["id"]).json()
    r = system["issuer"].post(f"/credentials/{cred['id']}/revoke", json={"reason": "lost_device"},
                              headers=tokens["officer1"])
    assert r.status_code == 200 and r.json()["published"]
    result = verify_credential(decode_qr(cred["qr_text"]), trusted_keys(system["trust"]),
                               revoked_ids(system["trust"]), date.today())
    assert Reason.REVOKED in result.reasons
    again = system["issuer"].post(f"/credentials/{cred['id']}/revoke", json={"reason": "fraud"},
                                  headers=tokens["officer1"])
    assert again.status_code == 409


@pytest.mark.req("FR-09", "NFR-S5")
def test_tc_svc_025_trust_refuses_forged_rollback_or_unauthenticated_lists(system, tokens):
    trust, key = system["trust"], system["settings"].secret("service.key").decode()
    forged = sign_revocation_list(99, [], Ed25519PrivateKey.generate())
    body = {"payload_b64": b64url_encode(forged.payload_bytes), "signature_b64": b64url_encode(forged.signature)}
    assert trust.put("/internal/revocations", json=body, headers={"X-Service-Key": key}).status_code == 422
    assert trust.put("/internal/revocations", json=body).status_code == 401
    cred = issue(system, tokens, enrol(system, tokens)["id"]).json()
    system["issuer"].post(f"/credentials/{cred['id']}/revoke", json={"reason": "fraud"}, headers=tokens["officer1"])
    from qrw_core.keys import load_private_key
    s = system["settings"]
    old = sign_revocation_list(0, [], load_private_key(s.secrets_dir / "issuer_private.pem", s.key_password))
    rollback = {"payload_b64": b64url_encode(old.payload_bytes), "signature_b64": b64url_encode(old.signature)}
    assert trust.put("/internal/revocations", json=rollback, headers={"X-Service-Key": key}).status_code == 409
    assert cred["id"] in revoked_ids(trust)


class _DownClient:
    def put(self, *a, **k):
        raise httpx.ConnectError("trust is down")


@pytest.mark.req("FR-07", "NFR-P3")
def test_tc_svc_026_revocation_survives_trust_outage_and_republishes(system, tokens):
    cred = issue(system, tokens, enrol(system, tokens)["id"]).json()
    real = system["issuer_app"].state.clients["trust"]
    system["issuer_app"].state.clients["trust"] = _DownClient()
    r = system["issuer"].post(f"/credentials/{cred['id']}/revoke", json={"reason": "death"},
                              headers=tokens["officer1"])
    assert r.status_code == 200 and r.json()["published"] is False
    system["issuer_app"].state.clients["trust"] = real
    assert system["issuer"].post("/revocations/publish", headers=tokens["officer1"]).json()["published"]
    assert cred["id"] in revoked_ids(system["trust"])
