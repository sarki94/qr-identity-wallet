"""Ed25519 key helpers (NFR-S1)."""
import hashlib
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

from .encoding import b64url_decode, b64url_encode

_RAW = dict(encoding=serialization.Encoding.Raw, format=serialization.PublicFormat.Raw)


def public_key_b64(pub: Ed25519PublicKey) -> str:
    return b64url_encode(pub.public_bytes(**_RAW))


def load_public_key_b64(text: str) -> Ed25519PublicKey:
    return Ed25519PublicKey.from_public_bytes(b64url_decode(text))


def key_id(pub: Ed25519PublicKey) -> str:
    """Short, stable identifier for an issuer public key."""
    return "iss-" + hashlib.sha256(pub.public_bytes(**_RAW)).hexdigest()[:12]


def save_private_key(key: Ed25519PrivateKey, path: Path, password: bytes) -> None:
    """Write the issuer signing key encrypted at rest (prototype stand-in for an HSM)."""
    pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.BestAvailableEncryption(password),
    )
    Path(path).write_bytes(pem)


def load_private_key(path: Path, password: bytes) -> Ed25519PrivateKey:
    key = serialization.load_pem_private_key(Path(path).read_bytes(), password=password)
    if not isinstance(key, Ed25519PrivateKey):
        raise ValueError("not an Ed25519 private key")
    return key
