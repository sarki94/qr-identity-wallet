"""Signed, versioned revocation list published by the Trust service (FR-08, FR-09)."""
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, Mapping, Optional

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

from .encoding import canonical_json
from .keys import key_id

LIST_TYPE = "QRW1-REVOCATIONS"


class RevocationError(ValueError):
    """The revocation list is not authentic or not well formed."""


@dataclass(frozen=True)
class RevocationList:
    version: int
    revoked_ids: tuple
    issuer_key_id: str
    published_at: str


@dataclass(frozen=True)
class SignedRevocationList:
    payload_bytes: bytes
    signature: bytes


def sign_revocation_list(version: int, ids: Iterable[str], issuer_key: Ed25519PrivateKey,
                         published_at: Optional[str] = None) -> SignedRevocationList:
    body = {
        "typ": LIST_TYPE,
        "ver": int(version),
        "kid": key_id(issuer_key.public_key()),
        "at": published_at or datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "ids": sorted(set(ids)),
    }
    data = canonical_json(body)
    return SignedRevocationList(data, issuer_key.sign(data))


def verify_revocation_list(signed: SignedRevocationList,
                           trusted_keys: Mapping[str, Ed25519PublicKey]) -> RevocationList:
    try:
        body = json.loads(signed.payload_bytes.decode("utf-8"))
        key = trusted_keys[body["kid"]]
        key.verify(signed.signature, signed.payload_bytes)
        if body["typ"] != LIST_TYPE or not isinstance(body["ver"], int):
            raise RevocationError("wrong list type")
        ids = body["ids"]
        if not isinstance(ids, list) or not all(isinstance(i, str) for i in ids):
            raise RevocationError("bad id list")
        return RevocationList(body["ver"], tuple(sorted(ids)), body["kid"], body["at"])
    except RevocationError:
        raise
    except (InvalidSignature, KeyError, TypeError, ValueError) as exc:
        raise RevocationError("revocation list rejected") from exc
