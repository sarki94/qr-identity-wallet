"""Signed, versioned revocation list (FR-09, NFR-S5)."""
import dataclasses

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from qrw_core.keys import key_id
from qrw_core.revocation import RevocationError, sign_revocation_list, verify_revocation_list


@pytest.mark.req("FR-09")
def test_tc_core_040_signed_list_verifies(issuer_key, trusted):
    signed = sign_revocation_list(3, ["cred-0002", "cred-0001"], issuer_key)
    lst = verify_revocation_list(signed, trusted)
    assert lst.version == 3
    assert lst.revoked_ids == ("cred-0001", "cred-0002")
    assert lst.issuer_key_id == key_id(issuer_key.public_key())


@pytest.mark.req("FR-09", "NFR-S5")
def test_tc_core_041_list_with_removed_entry_is_rejected(issuer_key, trusted):
    signed = sign_revocation_list(3, ["cred-0001", "cred-0002"], issuer_key)
    forged = dataclasses.replace(signed, payload_bytes=signed.payload_bytes.replace(b'"cred-0002"', b'"cred-0003"'))
    with pytest.raises(RevocationError):
        verify_revocation_list(forged, trusted)


@pytest.mark.req("FR-09", "NFR-S5")
def test_tc_core_042_list_from_unknown_key_is_rejected(trusted):
    signed = sign_revocation_list(1, ["cred-0001"], Ed25519PrivateKey.generate())
    with pytest.raises(RevocationError):
        verify_revocation_list(signed, trusted)
