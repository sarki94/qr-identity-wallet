"""Key storage (NFR-S1) and credential input validation (FR-03, FR-04, NFR-S5)."""
import dataclasses
from datetime import date

import pytest

from qrw_core.credential import Reason, issue_credential, verify_credential
from qrw_core.keys import load_private_key, public_key_b64, save_private_key


@pytest.mark.req("NFR-S1")
def test_tc_core_060_issuer_key_is_encrypted_at_rest(tmp_path, issuer_key):
    path = tmp_path / "issuer.pem"
    save_private_key(issuer_key, path, b"correct horse")
    assert b"ENCRYPTED" in path.read_bytes()
    loaded = load_private_key(path, b"correct horse")
    assert public_key_b64(loaded.public_key()) == public_key_b64(issuer_key.public_key())
    with pytest.raises(ValueError):
        load_private_key(path, b"wrong password")


@pytest.mark.req("FR-03", "FR-04", "NFR-S5")
@pytest.mark.parametrize("change", [
    {"level": "L3"},
    {"level": "L1"},                       # L1 still carrying a holder key
    {"name": ""},
    {"expires_on": date(2026, 10, 1)},     # expiry before issue
    {"issuer_key_id": "iss-not-mine"},     # key ID must match signing key
])
def test_tc_core_061_invalid_payloads_cannot_be_issued(issuer_key, l2_payload, change):
    with pytest.raises(ValueError):
        issue_credential(dataclasses.replace(l2_payload, **change), issuer_key)


@pytest.mark.req("FR-18")
def test_tc_core_062_credential_not_yet_valid_is_rejected(issuer_key, trusted, l2_payload):
    result = verify_credential(issue_credential(l2_payload, issuer_key), trusted, set(), date(2026, 1, 1))
    assert Reason.NOT_YET_VALID in result.reasons and not result.accepted


@pytest.mark.req("NFR-S5")
def test_tc_core_063_signed_but_structurally_invalid_payload_is_malformed(issuer_key, trusted):
    from qrw_core.credential import SignedCredential
    from qrw_core.encoding import canonical_json
    from qrw_core.keys import key_id
    body = canonical_json({"typ": "QRW1-CRED", "kid": key_id(issuer_key.public_key()), "extra": 1})
    result = verify_credential(SignedCredential(body, issuer_key.sign(body)), trusted, set(), date(2026, 11, 1))
    assert result.reasons == (Reason.MALFORMED,)
