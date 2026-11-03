"""Wire all five services together in-process, each with its own database."""
import pytest
from fastapi.testclient import TestClient

from qrw_services.audit.app import create_app as audit_app
from qrw_services.auth.app import create_app as auth_app
from qrw_services.issuer.app import create_app as issuer_app
from qrw_services.nimc.app import create_app as nimc_app
from qrw_services.secrets import init_secrets
from qrw_services.shared.config import Settings
from qrw_services.trust.app import create_app as trust_app

PASSWORDS = {"admin": "Admin#2026!", "officer1": "Officer#2026!", "agent1": "Agent#2026!",
             "agent2": "Agent#2026!", "auditor1": "Auditor#2026!"}


@pytest.fixture
def settings(tmp_path):
    s = Settings(secrets_dir=tmp_path / "secrets", data_dir=tmp_path / "data", key_password=b"test-password")
    init_secrets(s)
    return s


@pytest.fixture
def system(settings):
    """Start every service; Issuer talks to NIMC and Trust through in-process clients."""
    with TestClient(nimc_app(settings), base_url="http://nimc") as nimc, \
            TestClient(trust_app(settings), base_url="http://trust") as trust, \
            TestClient(auth_app(settings), base_url="http://auth") as auth, \
            TestClient(audit_app(settings), base_url="http://audit") as audit:
        issuer_application = issuer_app(settings, clients={"nimc": nimc, "trust": trust})
        with TestClient(issuer_application, base_url="http://issuer") as issuer:
            yield {"nimc": nimc, "trust": trust, "auth": auth, "audit": audit, "issuer": issuer,
                   "issuer_app": issuer_application, "settings": settings}


def login(auth, username, password=None):
    r = auth.post("/token", data={"username": username, "password": password or PASSWORDS[username]})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def tokens(system):
    return {u: login(system["auth"], u) for u in PASSWORDS}
