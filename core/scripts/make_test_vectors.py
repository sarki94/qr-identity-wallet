"""Generate cross-language test vectors: Python issues, the browser verifier must agree.

Run from the repo root:  python core/scripts/make_test_vectors.py
Writes web/tests/vectors.json (deterministic: fixed keys and nonce).
"""
import dataclasses
import json
from datetime import date
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from qrw_core.challenge import sign_challenge
from qrw_core.credential import CredentialPayload, SignedCredential, issue_credential
from qrw_core.encoding import b64url_encode
from qrw_core.keys import key_id, public_key_b64
from qrw_core.qr import encode_qr
from qrw_core.revocation import sign_revocation_list

issuer = Ed25519PrivateKey.from_private_bytes(bytes(range(32)))
holder_seed = bytes(range(100, 132))
holder = Ed25519PrivateKey.from_private_bytes(holder_seed)
kid = key_id(issuer.public_key())

base = CredentialPayload(
    credential_id="cred-vector-l2", issuer_key_id=kid, level="L2", nin_masked="123*****901",
    name="Musa Ibrahim", ward="Kura Ward", lga="Kura", state="Kano",
    issued_on=date(2026, 10, 30), expires_on=date(2027, 10, 30),
    holder_public_key=public_key_b64(holder.public_key()))
l2 = issue_credential(base, issuer)
l1 = issue_credential(dataclasses.replace(base, credential_id="cred-vector-l1", level="L1",
                                          holder_public_key=None, name="Hauwa Garba"), issuer)
tampered = SignedCredential(l2.payload_bytes.replace(b"Musa Ibrahim", b"Garba Usman!"), l2.signature)
nonce = "AAECAwQFBgcICQoLDA0ODw"
rev = sign_revocation_list(4, ["cred-vector-l1"], issuer, published_at="2026-11-03T09:00:00+00:00")

vectors = {
    "issuer": {"kid": kid, "public_key": public_key_b64(issuer.public_key())},
    "holder_seed_b64": b64url_encode(holder_seed),
    "today": "2026-11-03",
    "l2_qr": encode_qr(l2),
    "l1_qr": encode_qr(l1),
    "tampered_qr": encode_qr(tampered),
    "nonce": nonce,
    "response": sign_challenge(holder, nonce, "cred-vector-l2"),
    "revocation": {"payload_b64": b64url_encode(rev.payload_bytes), "signature_b64": b64url_encode(rev.signature)},
}
out = Path(__file__).resolve().parents[2] / "web" / "tests" / "vectors.json"
out.write_text(json.dumps(vectors, indent=2))
print(f"wrote {out}")
