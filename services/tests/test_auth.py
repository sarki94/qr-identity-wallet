"""Auth service: login, roles, lockout, rate limiting (FR-27, FR-28, FR-29, NFR-S7)."""
import jwt
import pytest

from conftest import login


@pytest.mark.req("FR-27")
def test_tc_svc_010_login_returns_eddsa_token_with_role(system):
    r = system["auth"].post("/token", data={"username": "agent1", "password": "Agent#2026!"})
    body = r.json()
    assert r.status_code == 200 and body["role"] == "Agent" and body["point_id"] == "KURA-01"
    assert jwt.get_unverified_header(body["access_token"])["alg"] == "EdDSA"
    me = system["auth"].get("/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.json() == {"username": "agent1", "role": "Agent", "point_id": "KURA-01"}


@pytest.mark.req("FR-14")
def test_tc_svc_011_agent_token_lasts_seven_days_for_offline_use(system):
    agent = system["auth"].post("/token", data={"username": "agent1", "password": "Agent#2026!"}).json()
    officer = system["auth"].post("/token", data={"username": "officer1", "password": "Officer#2026!"}).json()
    assert agent["expires_in"] == 7 * 24 * 3600 and officer["expires_in"] == 8 * 3600


@pytest.mark.req("NFR-S7", "FR-29")
def test_tc_svc_012_five_failed_logins_lock_account_until_admin_unlocks(system, tokens):
    auth = system["auth"]
    for _ in range(5):
        assert auth.post("/token", data={"username": "officer1", "password": "wrong"}).status_code == 401
    assert auth.post("/token", data={"username": "officer1", "password": "Officer#2026!"}).status_code == 423
    users = {u["username"]: u for u in auth.get("/users", headers=tokens["admin"]).json()}
    assert users["officer1"]["locked"]
    auth.patch(f"/users/{users['officer1']['id']}", json={"unlock": True}, headers=tokens["admin"])
    assert auth.post("/token", data={"username": "officer1", "password": "Officer#2026!"}).status_code == 200


@pytest.mark.req("FR-28", "NFR-S5")
@pytest.mark.parametrize("token", ["", "not-a-jwt", "eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4Iiwicm9sZSI6IkFkbWluIn0."])
def test_tc_svc_013_missing_or_forged_token_is_rejected(system, token):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    assert system["auth"].get("/users", headers=headers).status_code == 401


@pytest.mark.req("FR-28")
def test_tc_svc_014_roles_are_enforced_across_services(system, tokens):
    assert system["issuer"].post("/enrolments", json={"nin": "12345678901"},
                                 headers=tokens["agent1"]).status_code == 403
    assert system["auth"].get("/users", headers=tokens["officer1"]).status_code == 403
    assert system["audit"].get("/records", headers=tokens["agent1"]).status_code == 403
    assert system["audit"].post("/records", json=[], headers=tokens["officer1"]).status_code == 403


@pytest.mark.req("FR-29")
def test_tc_svc_015_admin_creates_agent_assigned_to_point(system, tokens):
    r = system["auth"].post("/users", headers=tokens["admin"], json={
        "username": "agent9", "password": "Strong#Pass9", "role": "Agent", "point_id": "KURA-09"})
    assert r.status_code == 201
    assert system["auth"].get("/me", headers=login(system["auth"], "agent9", "Strong#Pass9")).json()["point_id"] \
        == "KURA-09"
    assert system["auth"].post("/users", headers=tokens["admin"], json={
        "username": "agent9", "password": "Strong#Pass9", "role": "Agent"}).status_code == 409


@pytest.mark.req("NFR-S7")
def test_tc_svc_016_login_endpoint_is_rate_limited(system):
    codes = [system["auth"].post("/token", data={"username": "nobody", "password": "x"}).status_code
             for _ in range(21)]
    assert codes[:20] == [401] * 20 and codes[20] == 429


@pytest.mark.req("NFR-P3")
def test_tc_svc_001_every_service_reports_healthy(system):
    for name in ("auth", "issuer", "trust", "audit", "nimc"):
        assert system[name].get("/health").json()["status"] == "ok"
