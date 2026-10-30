"""Identity credential: issue and verify (FR-03 to FR-06, FR-16, FR-18, NFR-S4, NFR-S5).

The issuer signs the exact payload bytes. The verifier checks the
signature over those same bytes before trusting any field, so there is
no canonicalisation step that two implementations could disagree on.
"""
import json
import re
from dataclasses import asdict, dataclass
from datetime import date
from enum import Enum
from typing import Container, Mapping, Optional

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

from .encoding import canonical_json
from .keys import key_id

CRED_TYPE = "QRW1-CRED"
LEVELS = ("L1", "L2")
_MASKED_NIN = re.compile(r"^\d{3}\*{5}\d{3}$")
_FIELDS = {  # Python name -> short wire name (keeps the QR small)
    "credential_id": "id", "issuer_key_id": "kid", "level": "lvl", "nin_masked": "nin",
    "name": "nm", "ward": "wd", "lga": "lga", "state": "st", "issued_on": "iat",
    "expires_on": "exp", "holder_public_key": "hpk", "photo": "ph",
}
_OPTIONAL = {"holder_public_key", "photo"}


class Reason(str, Enum):
    MALFORMED = "MALFORMED"
    UNKNOWN_ISSUER = "UNKNOWN_ISSUER"
    BAD_SIGNATURE = "BAD_SIGNATURE"
    NOT_YET_VALID = "NOT_YET_VALID"
    EXPIRED = "EXPIRED"
    REVOKED = "REVOKED"


def mask_nin(nin: str) -> str:
    """Keep only the first and last three digits of an 11-digit NIN (NFR-S4)."""
    if not re.fullmatch(r"\d{11}", nin or ""):
        raise ValueError("NIN must be exactly 11 digits")
    return f"{nin[:3]}*****{nin[-3:]}"


@dataclass(frozen=True)
class CredentialPayload:
    credential_id: str
    issuer_key_id: str
    level: str
    nin_masked: str
    name: str
    ward: str
    lga: str
    state: str
    issued_on: date
    expires_on: date
    holder_public_key: Optional[str] = None
    photo: Optional[str] = None

    def validate(self) -> None:
        if self.level not in LEVELS:
            raise ValueError("level must be L1 or L2")
        if self.level == "L2" and not self.holder_public_key:
            raise ValueError("an L2 credential must carry the holder public key")
        if self.level == "L1" and self.holder_public_key:
            raise ValueError("an L1 credential must not carry a holder public key")
        if not _MASKED_NIN.match(self.nin_masked):
            raise ValueError("NIN must be masked (e.g. 123*****901)")
        for f in ("credential_id", "issuer_key_id", "name", "ward", "lga", "state"):
            if not isinstance(getattr(self, f), str) or not getattr(self, f):
                raise ValueError(f"{f} must be a non-empty string")
        if self.expires_on <= self.issued_on:
            raise ValueError("expiry must be after issue date")

    def to_wire(self) -> dict:
        body = {"typ": CRED_TYPE}
        for name, value in asdict(self).items():
            if value is None:
                continue
            body[_FIELDS[name]] = value.isoformat() if isinstance(value, date) else value
        return body

    @classmethod
    def from_wire(cls, body: dict) -> "CredentialPayload":
        if not isinstance(body, dict) or body.get("typ") != CRED_TYPE:
            raise ValueError("not a QRW1 credential")
        allowed = set(_FIELDS.values()) | {"typ"}
        if set(body) - allowed:
            raise ValueError("unexpected fields")
        kwargs = {}
        for name, short in _FIELDS.items():
            if short not in body:
                if name in _OPTIONAL:
                    continue
                raise ValueError(f"missing field {short}")
            value = body[short]
            if name in ("issued_on", "expires_on"):
                value = date.fromisoformat(value)
            kwargs[name] = value
        payload = cls(**kwargs)
        payload.validate()
        return payload


@dataclass(frozen=True)
class SignedCredential:
    payload_bytes: bytes
    signature: bytes


@dataclass(frozen=True)
class VerificationResult:
    accepted: bool
    reasons: tuple = ()
    payload: Optional[CredentialPayload] = None


def issue_credential(payload: CredentialPayload, issuer_key: Ed25519PrivateKey) -> SignedCredential:
    payload.validate()
    if payload.issuer_key_id != key_id(issuer_key.public_key()):
        raise ValueError("issuer_key_id does not match the signing key")
    data = canonical_json(payload.to_wire())
    return SignedCredential(data, issuer_key.sign(data))


def _reject(*reasons: Reason) -> VerificationResult:
    return VerificationResult(False, tuple(reasons), None)


def verify_credential(
    signed: SignedCredential,
    trusted_keys: Mapping[str, Ed25519PublicKey],
    revoked_ids: Container[str],
    today: date,
) -> VerificationResult:
    """Fail securely: any doubt returns a rejection, never an exception."""
    try:
        body = json.loads(signed.payload_bytes.decode("utf-8"))
        kid = body.get("kid") if isinstance(body, dict) else None
    except (UnicodeDecodeError, ValueError):
        return _reject(Reason.MALFORMED)
    key = trusted_keys.get(kid) if isinstance(kid, str) else None
    if key is None:
        return _reject(Reason.UNKNOWN_ISSUER)
    try:
        key.verify(signed.signature, signed.payload_bytes)
    except (InvalidSignature, ValueError):
        return _reject(Reason.BAD_SIGNATURE)
    try:
        payload = CredentialPayload.from_wire(body)
    except (ValueError, TypeError):
        return _reject(Reason.MALFORMED)
    reasons = []
    if today < payload.issued_on:
        reasons.append(Reason.NOT_YET_VALID)
    if today > payload.expires_on:
        reasons.append(Reason.EXPIRED)
    if payload.credential_id in revoked_ids:
        reasons.append(Reason.REVOKED)
    if reasons:
        return VerificationResult(False, tuple(reasons), None)
    return VerificationResult(True, (), payload)
