"""Tamper-evident hash-chained audit log (FR-24, FR-25, NFR-S6)."""
import pytest
from hypothesis import given, strategies as st

from qrw_core.audit import GENESIS, append_record, verify_chain


def build(n):
    chain = []
    for i in range(n):
        chain = append_record(chain, {"seq": i, "cred": f"cred-{i:04d}", "result": "accepted"})
    return chain


@pytest.mark.req("FR-24", "FR-25")
def test_tc_core_050_intact_chain_verifies():
    chain = build(10)
    assert chain[0].prev_hash == GENESIS
    assert verify_chain(chain) is None


@pytest.mark.req("FR-25", "NFR-S6")
@given(n=st.integers(2, 12), data=st.data())
def test_tc_core_051_editing_any_record_is_detected(n, data):
    chain = build(n)
    i = data.draw(st.integers(0, n - 1))
    edited = dict(chain[i].record, result="rejected" if chain[i].record["result"] == "accepted" else "accepted")
    chain[i] = chain[i]._replace(record=edited)
    broken = verify_chain(chain)
    assert broken is not None and broken <= i


@pytest.mark.req("FR-25", "NFR-S6")
def test_tc_core_052_deleting_a_record_is_detected():
    chain = build(5)
    del chain[2]
    assert verify_chain(chain) == 2


@pytest.mark.req("FR-25", "NFR-S6")
def test_tc_core_053_reordering_is_detected():
    chain = build(5)
    chain[1], chain[2] = chain[2], chain[1]
    assert verify_chain(chain) == 1
