"""Issuer service: enrol farmers, issue and revoke credentials (FR-01 to FR-07, D8, NFR-S1, NFR-S4).

Only this service can read the issuer signing key. It signs credentials and
revocation lists and pushes the signed list to the Trust service, which can
publish it but cannot forge it.
"""
import hashlib
import hmac
import logging
import secrets
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, select
from sqlalchemy.orm import Mapped, mapped_column

from qrw_core.credential import CredentialPayload, issue_credential, mask_nin
from qrw_core.encoding import b64url_decode, b64url_encode
from qrw_core.keys import key_id, load_private_key, load_public_key_b64
from qrw_core.qr import encode_qr
from qrw_core.revocation import sign_revocation_list

from ..shared.app import base_app
from ..shared.config import Settings
from ..shared.db import Base, make_session_factory
from ..shared.security import Principal, RateLimiter, require_roles

log = logging.getLogger("qrw.issuer")
MAX_PHOTO_CHARS = 1400  # ~1 KB thumbnail keeps the QR within NFR-C1


class Farmer(Base):
    __tablename__ = "farmers"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nin_hash: Mapped[str] = mapped_column(String(64), unique=True)
    nin_masked: Mapped[str] = mapped_column(String(11))
    name: Mapped[str] = mapped_column(String(120))
    ward: Mapped[str] = mapped_column(String(80))
    lga: Mapped[str] = mapped_column(String(80))
    state: Mapped[str] = mapped_column(String(80))
    enrolled_by: Mapped[str] = mapped_column(String(64))
    enrolled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Credential(Base):
    __tablename__ = "credentials"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    farmer_id: Mapped[int] = mapped_column(ForeignKey("farmers.id"))
    level: Mapped[str] = mapped_column(String(2))
    holder_public_key: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    issued_on: Mapped[date] = mapped_column(Date)
    expires_on: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(10), default="Active")
    revoked_reason: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    issued_by: Mapped[str] = mapped_column(String(64))
    qr_text: Mapped[str] = mapped_column(Text)


class RevocationState(Base):
    __tablename__ = "revocation_state"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    version: Mapped[int] = mapped_column(Integer, default=0)
    published_version: Mapped[int] = mapped_column(Integer, default=0)


class EnrolRequest(BaseModel):
    nin: str = Field(pattern=r"^\d{11}$")


class IssueRequest(BaseModel):
    farmer_id: int
    level: str = Field(pattern="^(L1|L2)$")
    holder_public_key: Optional[str] = Field(default=None, max_length=64)
    photo: Optional[str] = Field(default=None, max_length=MAX_PHOTO_CHARS)


class RevokeRequest(BaseModel):
    reason: str = Field(pattern="^(lost_device|death|fraud|re-issue|other)$")


def _farmer_out(f: Farmer, active: Optional[Credential]) -> dict:
    return {"id": f.id, "nin_masked": f.nin_masked, "name": f.name, "ward": f.ward, "lga": f.lga,
            "state": f.state, "active_credential_id": active.id if active else None}


def _cred_out(c: Credential) -> dict:
    return {"id": c.id, "farmer_id": c.farmer_id, "level": c.level, "status": c.status,
            "issued_on": c.issued_on.isoformat(), "expires_on": c.expires_on.isoformat(),
            "revoked_reason": c.revoked_reason, "qr_text": c.qr_text}


def create_app(settings: Settings = None, clients: dict = None):
    settings = settings or Settings()
    sessions = make_session_factory(settings.db_url("issuer"), Base.metadata)
    signing_key = load_private_key(settings.secrets_dir / "issuer_private.pem", settings.key_password)
    kid = key_id(signing_key.public_key())
    pepper = settings.secret("nin_pepper.key")
    service_key = settings.secret("service.key").decode()

    def client(name: str) -> httpx.Client:
        return app.state.clients[name]

    def nin_hash(nin: str) -> str:
        return hmac.new(pepper, nin.encode(), hashlib.sha256).hexdigest()

    def state_row(db) -> RevocationState:
        row = db.get(RevocationState, 1)
        if row is None:
            row = RevocationState(id=1, version=0, published_version=0)
            db.add(row)
            db.flush()
        return row

    def publish_revocations() -> bool:
        """Sign the full revocation list and push it to Trust. Retried on the next change if Trust is down."""
        with sessions() as db:
            row = state_row(db)
            ids = list(db.scalars(select(Credential.id).where(Credential.status == "Revoked")))
            signed = sign_revocation_list(row.version, ids, signing_key)
            try:
                r = client("trust").put("/internal/revocations", headers={"X-Service-Key": service_key}, json={
                    "payload_b64": b64url_encode(signed.payload_bytes),
                    "signature_b64": b64url_encode(signed.signature)})
                r.raise_for_status()
            except httpx.HTTPError as exc:
                log.warning("revocation list v%s not published yet: %s", row.version, exc)
                db.commit()
                return False
            row.published_version = row.version
            db.commit()
            return True

    @asynccontextmanager
    async def lifespan(app):
        publish_revocations()
        yield

    app = base_app("issuer", settings, lifespan)
    app.state.auth_public_key = load_public_key_b64(settings.secret("auth_public.b64").decode())
    app.state.clients = clients or {
        "nimc": httpx.Client(base_url=settings.nimc_url, timeout=5),
        "trust": httpx.Client(base_url=settings.trust_url, timeout=5),
    }
    officer = require_roles("Officer")
    limiter = RateLimiter(limit=60, window_seconds=60)

    @app.post("/enrolments", tags=["enrolment"], dependencies=[Depends(limiter)])
    def enrol(body: EnrolRequest, p: Principal = Depends(officer)):
        try:
            r = client("nimc").get(f"/nin/{body.nin}")
        except httpx.HTTPError:
            raise HTTPException(503, "NIMC is unreachable; try again")
        if r.status_code == 404:
            raise HTTPException(404, "NIN not found at NIMC")
        r.raise_for_status()
        rec = r.json()
        with sessions() as db:
            farmer = db.scalar(select(Farmer).where(Farmer.nin_hash == nin_hash(body.nin)))
            if farmer is None:
                farmer = Farmer(nin_hash=nin_hash(body.nin), nin_masked=mask_nin(body.nin),
                                name=f"{rec['first_name']} {rec['last_name']}", ward=rec["ward"], lga=rec["lga"],
                                state=rec["state"], enrolled_by=p.username, enrolled_at=datetime.now(timezone.utc))
                db.add(farmer)
                db.commit()
            active = db.scalar(select(Credential).where(Credential.farmer_id == farmer.id,
                                                        Credential.status == "Active"))
            return _farmer_out(farmer, active)

    @app.post("/credentials", tags=["credentials"], status_code=201, dependencies=[Depends(limiter)])
    def issue(body: IssueRequest, p: Principal = Depends(officer)):
        if body.level == "L2":
            try:
                if len(b64url_decode(body.holder_public_key or "")) != 32:
                    raise ValueError
                load_public_key_b64(body.holder_public_key)
            except ValueError:
                raise HTTPException(422, "L2 needs a valid 32-byte Ed25519 holder public key")
        elif body.holder_public_key:
            raise HTTPException(422, "L1 (paper wallet) must not carry a holder key")
        with sessions() as db:
            farmer = db.get(Farmer, body.farmer_id)
            if farmer is None:
                raise HTTPException(404, "farmer not enrolled")
            today = date.today()
            payload = CredentialPayload(
                credential_id="cred-" + secrets.token_hex(8), issuer_key_id=kid, level=body.level,
                nin_masked=farmer.nin_masked, name=farmer.name, ward=farmer.ward, lga=farmer.lga,
                state=farmer.state, issued_on=today,
                expires_on=today + timedelta(days=settings.credential_validity_days),
                holder_public_key=body.holder_public_key if body.level == "L2" else None, photo=body.photo)
            qr_text = encode_qr(issue_credential(payload, signing_key))
            # D8: atomic re-issue. Revoke the old credential and save the new one in ONE transaction.
            old = db.scalar(select(Credential).where(Credential.farmer_id == farmer.id,
                                                     Credential.status == "Active"))
            reissued = old is not None
            if reissued:
                old.status, old.revoked_reason = "Revoked", "re-issue"
                old.revoked_at = datetime.now(timezone.utc)
                state_row(db).version += 1
            cred = Credential(id=payload.credential_id, farmer_id=farmer.id, level=body.level,
                              holder_public_key=payload.holder_public_key, issued_on=payload.issued_on,
                              expires_on=payload.expires_on, issued_by=p.username, qr_text=qr_text)
            db.add(cred)
            db.commit()
            out = _cred_out(cred)
        out["published"] = publish_revocations() if reissued else True
        return out

    @app.post("/credentials/{credential_id}/revoke", tags=["credentials"])
    def revoke(credential_id: str, body: RevokeRequest, _: Principal = Depends(officer)):
        with sessions() as db:
            cred = db.get(Credential, credential_id)
            if cred is None:
                raise HTTPException(404, "credential not found")
            if cred.status != "Active":
                raise HTTPException(409, f"credential is already {cred.status}")
            cred.status, cred.revoked_reason = "Revoked", body.reason
            cred.revoked_at = datetime.now(timezone.utc)
            state_row(db).version += 1
            db.commit()
            out = _cred_out(cred)
        out["published"] = publish_revocations()
        return out

    @app.post("/revocations/publish", tags=["credentials"])
    def republish(_: Principal = Depends(require_roles("Officer", "Admin"))):
        return {"published": publish_revocations()}

    @app.get("/farmers/{farmer_id}/credentials", tags=["credentials"])
    def farmer_credentials(farmer_id: int, _: Principal = Depends(require_roles("Officer", "Admin"))):
        with sessions() as db:
            return [_cred_out(c) for c in db.scalars(
                select(Credential).where(Credential.farmer_id == farmer_id).order_by(Credential.issued_on))]

    return app


def get_app():
    return create_app()
