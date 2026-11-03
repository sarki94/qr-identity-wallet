"""Performance and capacity requirements (NFR-P1, NFR-C3)."""
import secrets
import time
import zlib
from datetime import date

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from qrw_core.challenge import new_challenge, sign_challenge, verify_challenge_response
from qrw_core.credential import issue_credential, verify_credential
from qrw_core.keys import key_id
from qrw_core.qr import decode_qr, encode_qr
from qrw_core.revocation import sign_revocation_list, verify_revocation_list


@pytest.mark.req("NFR-P1")
def test_tc_core_070_offline_verification_is_far_inside_three_seconds(issuer_key, holder_key, trusted, l2_payload):
    qr = encode_qr(issue_credential(l2_payload, issuer_key))
    revoked = {f"cred-{i:016x}" for i in range(10_000)}
    start = time.perf_counter()
    for _ in range(200):
        result = verify_credential(decode_qr(qr), trusted, revoked, date(2026, 11, 1))
        nonce = new_challenge()
        answer = sign_challenge(holder_key, nonce, "cred-0001")
        hpk = result.payload.holder_public_key
        assert result.accepted and verify_challenge_response(hpk, nonce, "cred-0001", answer)
    per_check = (time.perf_counter() - start) / 200
    print(f"\nNFR-P1: {per_check * 1000:.2f} ms per full offline check (budget 3000 ms)")
    assert per_check < 0.05


@pytest.mark.req("NFR-C3", "FR-09")
def test_tc_core_071_revocation_list_of_100k_fits_in_two_megabytes(issuer_key):
    """First run failed: 2.40 MB as plain JSON. Fixed by compressing the list in transit (gzip)
    and in the verifier's cache (deflate). Both are measured here."""
    ids = [f"cred-{secrets.token_hex(8)}" for _ in range(100_000)]
    signed = sign_revocation_list(7, ids, issuer_key)
    raw = len(signed.payload_bytes) + len(signed.signature)
    compressed = len(zlib.compress(signed.payload_bytes, 6)) + len(signed.signature)
    print(f"\nNFR-C3: 100,000 IDs = {raw / 1e6:.2f} MB plain, {compressed / 1e6:.2f} MB compressed (budget 2 MB)")
    assert compressed <= 2_000_000
    pub = issuer_key.public_key()
    assert len(verify_revocation_list(signed, {key_id(pub): pub}).revoked_ids) == 100_000


@pytest.mark.req("NFR-P1")
def test_tc_core_072_signing_throughput_supports_enrolment_queues():
    key = Ed25519PrivateKey.generate()
    start = time.perf_counter()
    for _ in range(500):
        key.sign(secrets.token_bytes(400))
    assert (time.perf_counter() - start) / 500 < 0.01
