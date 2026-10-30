"""Credential issuance and verification (FR-03 to FR-06, FR-16, FR-18, NFR-S4, NFR-S5)."""
import dataclasses
import json
from datetime import date

import pytest
from hypothesis import HealthCheck, given, settings, strategies as st
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from qrw_core.credential import (
    CredentialPayload, Reason, SignedCredential, issue_credential, mask_nin, verify_credential,
)
from conftest import TODAY

FIXTURES_OK = settings(suppress_health_check=[HealthCheck.function_scoped_fixture])


@pytest.mark.req("FR-03", "FR-16")
def test_tc_core_010_issued_l2_credential_verifies(issuer_key, trusted, l2_payload):
    signed = issue_credential(l2_payload, issuer_key)
    result = verify_credential(signed, trusted, revoked_ids=set(), today=TODAY)
    assert result.accepted
    assert result.payload == l2_payload


@pytest.mark.req("FR-05")
def test_tc_core_011_l1_credential_without_holder_key_verifies(issuer_key, trusted, l2_payload):
    l1 = dataclasses.replace(l2_payload, level="L1", holder_public_key=None)
    result = verify_credential(issue_credential(l1, issuer_key), trusted, set(), TODAY)
    assert result.accepted


@pytest.mark.req("FR-04")
def test_tc_core_012_l2_without_holder_key_cannot_be_issued(issuer_key, l2_payload):
    with pytest.raises(ValueError):
        issue_credential(dataclasses.replace(l2_payload, holder_public_key=None), issuer_key)


@pytest.mark.req("FR-16", "NFR-S5")
def test_tc_core_013_tampered_name_is_rejected(issuer_key, trusted, l2_payload):
    signed = issue_credential(l2_payload, issuer_key)
    body = json.loads(signed.payload_bytes)
    body["nm"] = "Garba Usman"
    forged = SignedCredential(json.dumps(body).encode(), signed.signature)
    result = verify_credential(forged, trusted, set(), TODAY)
    assert not result.accepted
    assert Reason.BAD_SIGNATURE in result.reasons
    assert result.payload is None


@pytest.mark.req("FR-16", "NFR-S5")
@FIXTURES_OK
@given(data=st.data())
def test_tc_core_014_any_single_bit_flip_is_rejected(issuer_key, trusted, l2_payload, data):
    signed = issue_credential(l2_payload, issuer_key)
    target = data.draw(st.sampled_from(["payload", "signature"]))
    blob = bytearray(signed.payload_bytes if target == "payload" else signed.signature)
    i = data.draw(st.integers(0, len(blob) - 1))
    bit = data.draw(st.integers(0, 7))
    blob[i] ^= 1 << bit
    forged = (SignedCredential(bytes(blob), signed.signature) if target == "payload"
              else SignedCredential(signed.payload_bytes, bytes(blob)))
    assert not verify_credential(forged, trusted, set(), TODAY).accepted


@pytest.mark.req("NFR-S5")
def test_tc_core_015_unknown_issuer_is_rejected(issuer_key, l2_payload):
    other = Ed25519PrivateKey.generate().public_key()
    result = verify_credential(issue_credential(l2_payload, issuer_key), {"iss-other": other}, set(), TODAY)
    assert not result.accepted
    assert Reason.UNKNOWN_ISSUER in result.reasons


@pytest.mark.req("FR-18")
def test_tc_core_016_expired_credential_is_rejected(issuer_key, trusted, l2_payload):
    signed = issue_credential(l2_payload, issuer_key)
    result = verify_credential(signed, trusted, set(), today=date(2027, 10, 31))
    assert not result.accepted
    assert Reason.EXPIRED in result.reasons


@pytest.mark.req("FR-18")
def test_tc_core_017_revoked_credential_is_rejected(issuer_key, trusted, l2_payload):
    signed = issue_credential(l2_payload, issuer_key)
    result = verify_credential(signed, trusted, {"cred-0001"}, TODAY)
    assert not result.accepted
    assert Reason.REVOKED in result.reasons


@pytest.mark.req("NFR-S4")
def test_tc_core_018_nin_is_masked_and_full_nin_is_refused(issuer_key, l2_payload):
    assert mask_nin("12345678901") == "123*****901"
    with pytest.raises(ValueError):
        mask_nin("1234")
    with pytest.raises(ValueError):
        issue_credential(dataclasses.replace(l2_payload, nin_masked="12345678901"), issuer_key)


@pytest.mark.req("NFR-S5")
@given(garbage=st.binary(max_size=300), sig=st.binary(min_size=64, max_size=64))
def test_tc_core_019_garbage_never_raises_and_is_rejected(garbage, sig):
    key = Ed25519PrivateKey.generate().public_key()
    result = verify_credential(SignedCredential(garbage, sig), {"k": key}, set(), TODAY)
    assert not result.accepted


@pytest.mark.req("FR-03", "FR-16")
@FIXTURES_OK
@given(name=st.text(min_size=1, max_size=60), ward=st.text(min_size=1, max_size=40))
def test_tc_core_020_any_valid_text_round_trips(issuer_key, trusted, l2_payload, name, ward):
    payload = dataclasses.replace(l2_payload, name=name, ward=ward)
    result = verify_credential(issue_credential(payload, issuer_key), trusted, set(), TODAY)
    assert result.accepted and result.payload == payload
