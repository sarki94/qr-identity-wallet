"""Settings shared by every service, read from environment variables."""
import os
from dataclasses import dataclass, field
from pathlib import Path


def _list(value: str) -> list:
    return [v.strip() for v in value.split(",") if v.strip()]


@dataclass
class Settings:
    secrets_dir: Path = field(default_factory=lambda: Path(os.getenv("QRW_SECRETS_DIR", ".secrets")))
    data_dir: Path = field(default_factory=lambda: Path(os.getenv("QRW_DATA_DIR", "data")))
    key_password: bytes = field(default_factory=lambda: os.getenv("QRW_KEY_PASSWORD", "dev-only-change-me").encode())
    auth_url: str = field(default_factory=lambda: os.getenv("QRW_AUTH_URL", "http://localhost:8001"))
    issuer_url: str = field(default_factory=lambda: os.getenv("QRW_ISSUER_URL", "http://localhost:8002"))
    trust_url: str = field(default_factory=lambda: os.getenv("QRW_TRUST_URL", "http://localhost:8003"))
    audit_url: str = field(default_factory=lambda: os.getenv("QRW_AUDIT_URL", "http://localhost:8004"))
    nimc_url: str = field(default_factory=lambda: os.getenv("QRW_NIMC_URL", "http://localhost:8005"))
    cors_origins: list = field(default_factory=lambda: _list(os.getenv(
        "QRW_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")))
    api_docs: bool = field(default_factory=lambda: os.getenv("QRW_API_DOCS", "1") == "1")  # set 0 in production
    seed_demo_users: bool = field(default_factory=lambda: os.getenv("QRW_SEED_DEMO", "1") == "1")
    credential_validity_days: int = 365
    staff_token_hours: int = 8
    agent_token_hours: int = 168  # 7 days of offline use (FR-14)

    def db_url(self, service: str) -> str:
        override = os.getenv(f"QRW_{service.upper()}_DATABASE_URL")
        if override:
            return override
        self.data_dir.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{(self.data_dir / f'{service}.db').as_posix()}"

    def secret(self, name: str) -> bytes:
        return (self.secrets_dir / name).read_bytes().strip()
