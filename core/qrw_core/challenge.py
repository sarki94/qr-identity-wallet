"""Offline holder binding by challenge-response (FR-12, FR-17, FR-23).

The verifier shows a fresh 128-bit nonce; the wallet signs it together
with the credential ID. A screenshot or photocopy cannot sign a nonce it
has never seen, so replayed or copied credentials fail.
"""
import json
import secrets

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from .encoding import b64url_decode, b64url_encode
from .keys import load_public_key_b64

DOMAIN = "QRW1-CHALLENGE"  # domain separation: holder keys sign nothing else


def new_challenge() -> str:
    return b64url_encode(secrets.token_bytes(16))


def challenge_message(nonce: str, credential_id: str) -> bytes:
    return json.dumps([DOMAIN, nonce, credential_id], separators=(",", ":")).encode("utf-8")


def sign_challenge(holder_key: Ed25519PrivateKey, nonce: str, credential_id: str) -> str:
    return b64url_encode(holder_key.sign(challenge_message(nonce, credential_id)))


def verify_challenge_response(holder_public_key: str, nonce: str, credential_id: str, response: str) -> bool:
    try:
        pub = load_public_key_b64(holder_public_key)
        pub.verify(b64url_decode(response), challenge_message(nonce, credential_id))
        return True
    except (InvalidSignature, ValueError, TypeError):
        return False
