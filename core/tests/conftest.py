"""Shared fixtures for the qrw_core test suite."""
from datetime import date

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from qrw_core.credential import CredentialPayload
from qrw_core.keys import key_id, public_key_b64

TODAY = date(2026, 11, 1)


@pytest.fixture
def issuer_key():
    return Ed25519PrivateKey.generate()


@pytest.fixture
def holder_key():
    return Ed25519PrivateKey.generate()


@pytest.fixture
def trusted(issuer_key):
    pub = issuer_key.public_key()
    return {key_id(pub): pub}


@pytest.fixture
def l2_payload(issuer_key, holder_key):
    return CredentialPayload(
        credential_id="cred-0001",
        issuer_key_id=key_id(issuer_key.public_key()),
        level="L2",
        nin_masked="123*****901",
        name="Musa Ibrahim",
        ward="Kura Ward",
        lga="Kura",
        state="Kano",
        issued_on=date(2026, 10, 30),
        expires_on=date(2027, 10, 30),
        holder_public_key=public_key_b64(holder_key.public_key()),
    )
