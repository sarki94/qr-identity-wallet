"""Trust & Revocation service: publishes issuer public keys and the signed revocation list (FR-08, FR-09, FR-15).

It holds no private key. It checks every list the Issuer pushes and refuses
anything unsigned or older than what it already has (anti-rollback).
"""
from datetime import datetime, timezone

from fastapi import Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import DateTime, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from qrw_core.encoding import b64url_decode
from qrw_core.keys import key_id, load_public_key_b64, public_key_b64
from qrw_core.revocation import RevocationError, SignedRevocationList, verify_revocation_list

from ..shared.app import base_app
from ..shared.config import Settings
from ..shared.db import Base, make_session_factory
from ..shared.security import require_service_key


class PublishedList(Base):
    __tablename__ = "published_list"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    version: Mapped[int] = mapped_column(Integer)
    payload_b64: Mapped[str] = mapped_column(Text)
    signature_b64: Mapped[str] = mapped_column(Text)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SignedListIn(BaseModel):
    payload_b64: str
    signature_b64: str


def create_app(settings: Settings = None):
    settings = settings or Settings()
    sessions = make_session_factory(settings.db_url("trust"), Base.metadata)
    app = base_app("trust", settings)
    app.state.service_key = settings.secret("service.key")

    def key_set() -> dict:
        keys = {}
        for f in sorted(settings.secrets_dir.glob("issuer_public*.b64")):
            pub = load_public_key_b64(f.read_text().strip())
            keys[key_id(pub)] = pub
        return keys

    @app.get("/keys", tags=["trust"])
    def keys():
        return {"keys": [{"kid": k, "alg": "Ed25519", "public_key": public_key_b64(v)} for k, v in key_set().items()]}

    @app.get("/revocations", tags=["trust"])
    def revocations():
        with sessions() as db:
            row = db.get(PublishedList, 1)
            if row is None:
                raise HTTPException(404, "no revocation list published yet")
            return {"version": row.version, "payload_b64": row.payload_b64, "signature_b64": row.signature_b64,
                    "received_at": row.received_at.isoformat()}

    @app.put("/internal/revocations", tags=["internal"], dependencies=[Depends(require_service_key)])
    def receive(body: SignedListIn):
        try:
            signed = SignedRevocationList(b64url_decode(body.payload_b64), b64url_decode(body.signature_b64))
            lst = verify_revocation_list(signed, key_set())
        except (RevocationError, ValueError):
            raise HTTPException(422, "revocation list signature is not valid")
        with sessions() as db:
            row = db.get(PublishedList, 1)
            if row is not None and lst.version < row.version:
                raise HTTPException(409, f"refusing rollback from v{row.version} to v{lst.version}")
            if row is None:
                row = PublishedList(id=1)
                db.add(row)
            row.version, row.payload_b64, row.signature_b64 = lst.version, body.payload_b64, body.signature_b64
            row.received_at = datetime.now(timezone.utc)
            db.commit()
            return {"version": lst.version, "revoked": len(lst.revoked_ids)}

    return app


def get_app():
    return create_app()
