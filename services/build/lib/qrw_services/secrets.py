"""Create the key material every service needs (run once: `python -m qrw_services.secrets`).

Each service reads only the files it needs:
  auth_private.pem    -> Auth only (signs staff tokens)
  auth_public.b64     -> every service (verifies tokens)
  issuer_private.pem  -> Issuer only (signs credentials and revocation lists)
  issuer_public.b64   -> Trust (publishes it to verifiers)
  service.key         -> Issuer and Trust (internal publish calls)
  nin_pepper.key      -> Issuer only (keyed hash of NINs)
Private keys are encrypted at rest with QRW_KEY_PASSWORD (NFR-S1).
"""
import secrets
import sys
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from qrw_core.keys import public_key_b64, save_private_key

from .shared.config import Settings


def init_secrets(settings: Settings, overwrite: bool = False) -> Path:
    d = settings.secrets_dir
    d.mkdir(parents=True, exist_ok=True)
    if (d / "issuer_private.pem").exists() and not overwrite:
        return d
    for name in ("auth", "issuer"):
        key = Ed25519PrivateKey.generate()
        save_private_key(key, d / f"{name}_private.pem", settings.key_password)
        (d / f"{name}_public.b64").write_text(public_key_b64(key.public_key()))
    (d / "service.key").write_text(secrets.token_urlsafe(32))
    (d / "nin_pepper.key").write_text(secrets.token_urlsafe(32))
    return d


if __name__ == "__main__":
    path = init_secrets(Settings(), overwrite="--force" in sys.argv)
    print(f"secrets ready in {path.resolve()}")
