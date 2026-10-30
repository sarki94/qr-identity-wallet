"""Base45 (RFC 9285) and base64url encoding."""
import pytest
from hypothesis import given, strategies as st

from qrw_core.encoding import b45decode, b45encode, b64url_decode, b64url_encode


@pytest.mark.req("NFR-C1")
@pytest.mark.parametrize("raw, encoded", [
    (b"AB", "BB8"),
    (b"Hello!!", "%69 VD92EX0"),
    (b"base-45", "UJCLQE7W581"),
])
def test_tc_core_001_base45_matches_rfc9285_vectors(raw, encoded):
    assert b45encode(raw) == encoded


@pytest.mark.req("NFR-C1")
def test_tc_core_002_base45_decodes_rfc9285_vector():
    assert b45decode("QED8WEX0") == b"ietf!"


@pytest.mark.req("NFR-C1")
@given(st.binary(max_size=512))
def test_tc_core_003_base45_round_trip_property(data):
    assert b45decode(b45encode(data)) == data


@pytest.mark.req("NFR-S5")
@pytest.mark.parametrize("bad", ["GGW", "a", "BB", "::::"])
def test_tc_core_004_invalid_base45_raises_value_error(bad):
    with pytest.raises(ValueError):
        b45decode(bad)


@given(st.binary(max_size=256))
def test_tc_core_005_base64url_round_trip_property(data):
    text = b64url_encode(data)
    assert "=" not in text
    assert b64url_decode(text) == data
