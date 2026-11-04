"""Dynamic security tests against the running services (black-box, DAST-style).

Covers OWASP-style checks: injection, token forgery, broken access control,
oversized input, CORS, security headers and error-message leakage.
"""
import base64
import json
from datetime import datetime, timedelta, timezone

import jwt
import pytest

INJECTION = ["' OR '1'='1", "admin'--", "1; DROP TABLE users;--", "\" OR \"\"=\"", "${7*7}",
             "<script>alert(1)</script>"]


@pytest.mark.req("NFR-S5", "FR-27")
@pytest.mark.parametrize("payload", INJECTION)
def test_tc_sec_001_injection_in_login_is_rejected_cleanly(system, payload):
    r = system["auth"].post("/token", data={"username": payload, "password": payload})
    assert r.status_code == 401 and "Traceback" not in r.text


@pytest.mark.req("NFR-S5", "FR-01")
@pytest.mark.parametrize("payload", INJECTION + ["1234567890A", "1" * 12])
def test_tc_sec_002_injection_in_nin_is_rejected_by_validation(system, tokens, payload):
    r = system["issuer"].post("/enrolments", json={"nin": payload}, headers=tokens["officer1"])
    assert r.status_code == 422


@pytest.mark.req("NFR-S5")
def test_tc_sec_003_injection_in_audit_filters_returns_no_rows(system, tokens):
    r = system["audit"].get("/records", params={"result": "' OR '1'='1", "point_id": "x' OR 1=1--"},
                            headers=tokens["auditor1"])
    assert r.status_code == 200 and r.json() == []


def _b64(obj) -> str:
    return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b"=").decode()


@pytest.mark.req("FR-28", "NFR-S5")
def test_tc_sec_004_forged_tokens_are_rejected(system, settings):
    claims = {"iss": "qrw-auth", "sub": "mallory", "role": "Admin",
              "exp": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp())}
    alg_none = f"{_b64({'alg': 'none', 'typ': 'JWT'})}.{_b64(claims)}."
    # Key-confusion attack: sign with HS256 using the PUBLIC key as the HMAC secret.
    confused = jwt.encode(claims, settings.secret("auth_public.b64"), algorithm="HS256")
    for token in (alg_none, confused):
        assert system["auth"].get("/users", headers={"Authorization": f"Bearer {token}"}).status_code == 401


@pytest.mark.req("FR-28", "FR-14")
def test_tc_sec_005_expired_token_is_rejected(system, settings):
    from qrw_core.keys import load_private_key
    key = load_private_key(settings.secrets_dir / "auth_private.pem", settings.key_password)
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    token = jwt.encode({"iss": "qrw-auth", "sub": "agent1", "role": "Agent", "pt": "KURA-01", "exp": past},
                       key, algorithm="EdDSA")
    assert system["audit"].post("/records", json=[], headers={"Authorization": f"Bearer {token}"}).status_code == 401


@pytest.mark.req("FR-24", "NFR-S6")
def test_tc_sec_006_agent_cannot_file_records_as_someone_else(system, tokens):
    rec = {"record_id": "spoof-0001", "credential_id": "cred-x", "result": "accepted", "level": "L2",
           "verified_at": datetime.now(timezone.utc).isoformat(), "agent": "agent2", "point_id": "KURA-99"}
    system["audit"].post("/records", json=[rec], headers=tokens["agent1"])
    row = system["audit"].get("/records?credential_id=cred-x", headers=tokens["auditor1"]).json()[0]
    assert row["agent"] == "agent1" and row["point_id"] == "KURA-01"


@pytest.mark.req("NFR-C4", "NFR-S5")
def test_tc_sec_007_oversized_inputs_are_refused(system, tokens):
    too_many = [{"record_id": f"r-{i:06d}", "credential_id": "c", "result": "accepted",
                 "verified_at": "2026-11-03T10:00:00+00:00"} for i in range(2001)]
    assert system["audit"].post("/records", json=too_many, headers=tokens["agent1"]).status_code == 422
    fid = system["issuer"].post("/enrolments", json={"nin": "12345678901"}, headers=tokens["officer1"]).json()["id"]
    big_photo = system["issuer"].post("/credentials", headers=tokens["officer1"],
                                      json={"farmer_id": fid, "level": "L1", "photo": "A" * 5000})
    assert big_photo.status_code == 422


@pytest.mark.req("NFR-S5")
def test_tc_sec_008_security_headers_on_every_response(system):
    for name in ("auth", "issuer", "trust", "audit", "nimc"):
        h = system[name].get("/health").headers
        assert h["x-content-type-options"] == "nosniff" and h["x-frame-options"] == "DENY"
        assert h["cache-control"] == "no-store" and "default-src 'none'" in h["content-security-policy"]


@pytest.mark.req("NFR-S5")
def test_tc_sec_009_cors_allows_only_the_web_app_origin(system):
    good = system["trust"].get("/keys", headers={"Origin": "http://localhost:5173"})
    evil = system["trust"].get("/keys", headers={"Origin": "https://evil.example"})
    assert good.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert "access-control-allow-origin" not in evil.headers


@pytest.mark.req("NFR-S5")
def test_tc_sec_010_errors_never_leak_internals(system, tokens):
    s = system["issuer"]
    s.app.add_api_route("/boom", lambda: 1 / 0)
    r = s.get("/boom")
    assert r.status_code == 500 and r.json() == {"detail": "internal error"}
    assert "ZeroDivisionError" not in r.text and "Traceback" not in r.text


@pytest.mark.req("NFR-S5")
def test_tc_sec_011_api_docs_page_has_a_strict_content_security_policy(system):
    """Found by the OWASP ZAP scan (rule 10038): the /docs pages had no CSP."""
    import hashlib
    import re
    for name in ("auth", "issuer", "trust", "audit", "nimc"):
        r = system[name].get("/docs")
        csp = r.headers.get("content-security-policy", "")
        assert "frame-ancestors 'none'" in csp and "object-src 'none'" in csp
        script_src = re.search(r"script-src ([^;]*)", csp).group(1)
        assert "'unsafe-inline'" not in script_src and "'unsafe-eval'" not in script_src
        for body in re.findall(r"<script>(.*?)</script>", r.text, re.S):  # every inline script is hash-allowed
            digest = base64.b64encode(hashlib.sha256(body.encode()).digest()).decode()
            assert f"'sha256-{digest}'" in script_src


@pytest.mark.req("NFR-S5")
def test_tc_sec_012_api_docs_can_be_switched_off_for_production(settings):
    from dataclasses import replace

    from fastapi.testclient import TestClient
    from qrw_services.trust.app import create_app
    with TestClient(create_app(replace(settings, api_docs=False))) as trust:
        assert trust.get("/docs").status_code == 404 and trust.get("/openapi.json").status_code == 404
        assert trust.get("/keys").status_code == 200
