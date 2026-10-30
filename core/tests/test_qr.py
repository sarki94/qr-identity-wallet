"""QR text encoding of signed credentials (NFR-C1, NFR-S5)."""
import dataclasses
import os
import zlib

import pytest
from hypothesis import given, strategies as st

from qrw_core.credential import issue_credential
from qrw_core.encoding import b45encode, b64url_encode
from qrw_core.qr import PREFIX, InvalidQRError, decode_qr, encode_qr


@pytest.mark.req("FR-16")
def test_tc_core_021_qr_round_trip(issuer_key, l2_payload):
    signed = issue_credential(l2_payload, issuer_key)
    text = encode_qr(signed)
    assert text.startswith(PREFIX)
    assert decode_qr(text) == signed


@pytest.mark.req("NFR-C1", "FR-02")
def test_tc_core_022_credential_with_photo_fits_size_budget(issuer_key, l2_payload):
    photo = b64url_encode(os.urandom(1000))  # ~1 KB thumbnail, incompressible worst case
    signed = issue_credential(dataclasses.replace(l2_payload, photo=photo), issuer_key)
    text = encode_qr(signed)
    binary_size = len(zlib.compress(signed.signature + signed.payload_bytes, 9))
    assert binary_size <= 1800
    assert len(text) <= 4296  # QR version 40-L alphanumeric capacity


@pytest.mark.req("NFR-S5")
@given(st.text(max_size=400))
def test_tc_core_023_arbitrary_text_only_raises_invalid_qr(text):
    try:
        decode_qr(text)
    except InvalidQRError:
        pass


@pytest.mark.req("NFR-S5")
def test_tc_core_024_decompression_bomb_is_rejected():
    bomb = PREFIX + b45encode(zlib.compress(b"\0" * 5_000_000, 9))
    with pytest.raises(InvalidQRError):
        decode_qr(bomb)


@pytest.mark.req("NFR-S5")
def test_tc_core_025_wrong_prefix_is_rejected(issuer_key, l2_payload):
    text = encode_qr(issue_credential(l2_payload, issuer_key))
    with pytest.raises(InvalidQRError):
        decode_qr("XYZ1:" + text[len(PREFIX):])
