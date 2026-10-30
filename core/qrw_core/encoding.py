"""Text encodings used on the wire and inside QR codes.

Base45 (RFC 9285) is used for QR payloads because it maps onto the QR
alphanumeric mode, which stores data more densely than byte mode. The EU
Digital COVID Certificate used the same approach.
"""
import base64
import json
from typing import Any

_B45 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:"
_B45_INDEX = {c: i for i, c in enumerate(_B45)}


def b45encode(data: bytes) -> str:
    out = []
    for i in range(0, len(data) - 1, 2):
        n = data[i] * 256 + data[i + 1]
        n, c = divmod(n, 45)
        e, d = divmod(n, 45)
        out += [_B45[c], _B45[d], _B45[e]]
    if len(data) % 2:
        d, c = divmod(data[-1], 45)
        out += [_B45[c], _B45[d]]
    return "".join(out)


def b45decode(text: str) -> bytes:
    try:
        vals = [_B45_INDEX[c] for c in text]
    except KeyError as exc:
        raise ValueError(f"invalid base45 character: {exc}") from None
    if len(vals) % 3 == 1:
        raise ValueError("invalid base45 length")
    out = bytearray()
    for i in range(0, len(vals) - 2, 3):
        n = vals[i] + vals[i + 1] * 45 + vals[i + 2] * 2025
        if n > 0xFFFF:
            raise ValueError("base45 triplet out of range")
        out += n.to_bytes(2, "big")
    if len(vals) % 3 == 2:
        n = vals[-2] + vals[-1] * 45
        if n > 0xFF:
            raise ValueError("base45 pair out of range")
        out.append(n)
    return bytes(out)


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def b64url_decode(text: str) -> bytes:
    padded = text + "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(padded.encode("ascii"))


def canonical_json(obj: Any) -> bytes:
    """Deterministic JSON: sorted keys, no whitespace, UTF-8."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
