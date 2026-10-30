"""Holder binding by offline challenge-response (FR-12, FR-17, FR-23)."""
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from qrw_core.challenge import new_challenge, sign_challenge, verify_challenge_response
from qrw_core.encoding import b64url_decode
from qrw_core.keys import public_key_b64


@pytest.mark.req("FR-12", "FR-17")
def test_tc_core_030_genuine_wallet_response_verifies(holder_key):
    nonce = new_challenge()
    resp = sign_challenge(holder_key, nonce, "cred-0001")
    assert verify_challenge_response(public_key_b64(holder_key.public_key()), nonce, "cred-0001", resp)


@pytest.mark.req("FR-17", "FR-23")
def test_tc_core_031_replayed_response_fails_on_new_challenge(holder_key):
    old = sign_challenge(holder_key, new_challenge(), "cred-0001")
    assert not verify_challenge_response(public_key_b64(holder_key.public_key()), new_challenge(), "cred-0001", old)


@pytest.mark.req("FR-17", "FR-23")
def test_tc_core_032_response_from_another_device_fails(holder_key):
    nonce = new_challenge()
    impostor = sign_challenge(Ed25519PrivateKey.generate(), nonce, "cred-0001")
    assert not verify_challenge_response(public_key_b64(holder_key.public_key()), nonce, "cred-0001", impostor)


@pytest.mark.req("FR-17")
def test_tc_core_033_response_is_bound_to_credential_id(holder_key):
    nonce = new_challenge()
    resp = sign_challenge(holder_key, nonce, "cred-0001")
    assert not verify_challenge_response(public_key_b64(holder_key.public_key()), nonce, "cred-9999", resp)


@pytest.mark.req("FR-17")
def test_tc_core_034_challenges_are_unique_128_bit():
    nonces = {new_challenge() for _ in range(1000)}
    assert len(nonces) == 1000
    assert all(len(b64url_decode(n)) == 16 for n in nonces)


@pytest.mark.req("NFR-S5")
@pytest.mark.parametrize("bad", ["", "!!!", "AAAA", "x" * 200])
def test_tc_core_035_garbage_response_returns_false(holder_key, bad):
    assert verify_challenge_response(public_key_b64(holder_key.public_key()), new_challenge(), "cred-0001", bad) is False
