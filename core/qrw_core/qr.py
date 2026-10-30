"""QR text format: "QRW1:" + base45(zlib(signature || payload)) (NFR-C1, NFR-S5)."""
import zlib

from .credential import SignedCredential
from .encoding import b45decode, b45encode

PREFIX = "QRW1:"
SIG_LEN = 64
MAX_DECOMPRESSED = 8192  # guards against decompression bombs


class InvalidQRError(ValueError):
    """Raised for any QR text that is not a well-formed QRW1 credential."""


def encode_qr(signed: SignedCredential) -> str:
    return PREFIX + b45encode(zlib.compress(signed.signature + signed.payload_bytes, 9))


def decode_qr(text: str) -> SignedCredential:
    if not isinstance(text, str) or not text.startswith(PREFIX):
        raise InvalidQRError("not a QRW1 code")
    try:
        raw = b45decode(text[len(PREFIX):])
        inflater = zlib.decompressobj()
        data = inflater.decompress(raw, MAX_DECOMPRESSED)
    except (ValueError, zlib.error) as exc:
        raise InvalidQRError("corrupt QR payload") from exc
    if inflater.unconsumed_tail or not inflater.eof:
        raise InvalidQRError("QR payload too large or truncated")
    if len(data) <= SIG_LEN:
        raise InvalidQRError("QR payload too short")
    return SignedCredential(payload_bytes=data[SIG_LEN:], signature=data[:SIG_LEN])
