"""Auth service: staff login, EdDSA-signed JWTs, roles, lockout (FR-14, FR-27, FR-28, FR-29, NFR-S7)."""
import hashlib
import hmac
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, Form, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import Boolean, Integer, String, select
from sqlalchemy.orm import Mapped, mapped_column

from qrw_core.keys import load_private_key, load_public_key_b64

from ..shared.app import base_app
from ..shared.config import Settings
from ..shared.db import Base, make_session_factory
from ..shared.security import ISSUER_CLAIM, Principal, RateLimiter, current_principal, require_roles

ROLES = ("Officer", "Agent", "Admin", "Auditor")
MAX_FAILED_LOGINS = 5


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    password_hash: Mapped[str] = mapped_column(String(128))
    salt: Mapped[str] = mapped_column(String(64))
    role: Mapped[str] = mapped_column(String(16))
    point_id: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)


def hash_password(password: str, salt: str) -> str:
    return hashlib.scrypt(password.encode(), salt=salt.encode(), n=2**14, r=8, p=1).hex()


class NewUser(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_.-]+$")
    password: str = Field(min_length=8, max_length=128)
    role: str = Field(pattern="^(Officer|Agent|Admin|Auditor)$")
    point_id: Optional[str] = Field(default=None, max_length=32)


class UserUpdate(BaseModel):
    active: Optional[bool] = None
    unlock: bool = False
    point_id: Optional[str] = Field(default=None, max_length=32)


def _public(u: User) -> dict:
    return {"id": u.id, "username": u.username, "role": u.role, "point_id": u.point_id,
            "active": u.active, "locked": u.failed_logins >= MAX_FAILED_LOGINS}


DEMO_USERS = [  # documented demo accounts for the examiners' walkthrough
    ("admin", "Admin#2026!", "Admin", None),
    ("officer1", "Officer#2026!", "Officer", None),
    ("agent1", "Agent#2026!", "Agent", "KURA-01"),
    ("agent2", "Agent#2026!", "Agent", "KURA-02"),
    ("auditor1", "Auditor#2026!", "Auditor", None),
]


def create_app(settings: Settings = None):
    settings = settings or Settings()
    sessions = make_session_factory(settings.db_url("auth"), Base.metadata)
    private_key = load_private_key(settings.secrets_dir / "auth_private.pem", settings.key_password)

    def add_user(db, username, password, role, point_id):
        salt = secrets.token_hex(16)
        user = User(username=username, password_hash=hash_password(password, salt), salt=salt,
                    role=role, point_id=point_id)
        db.add(user)
        return user

    @asynccontextmanager
    async def lifespan(app):
        if settings.seed_demo_users:
            with sessions() as db:
                if db.scalar(select(User).limit(1)) is None:
                    for row in DEMO_USERS:
                        add_user(db, *row)
                    db.commit()
        yield

    app = base_app("auth", settings, lifespan)
    app.state.auth_public_key = load_public_key_b64(settings.secret("auth_public.b64").decode())
    login_limiter = RateLimiter(limit=20, window_seconds=60)

    @app.post("/token", tags=["auth"], dependencies=[Depends(login_limiter)])
    def token(username: str = Form(...), password: str = Form(...)):
        with sessions() as db:
            user = db.scalar(select(User).where(User.username == username))
            if user is None or not user.active:
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid credentials")
            if user.failed_logins >= MAX_FAILED_LOGINS:
                raise HTTPException(status.HTTP_423_LOCKED, "account locked; ask an Admin to unlock it")
            if not hmac.compare_digest(hash_password(password, user.salt), user.password_hash):
                user.failed_logins += 1
                db.commit()
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid credentials")
            user.failed_logins = 0
            db.commit()
            hours = settings.agent_token_hours if user.role == "Agent" else settings.staff_token_hours
            now = datetime.now(timezone.utc)
            claims = {"iss": ISSUER_CLAIM, "sub": user.username, "role": user.role, "pt": user.point_id,
                      "iat": now, "exp": now + timedelta(hours=hours)}
            return {"access_token": jwt.encode(claims, private_key, algorithm="EdDSA"),
                    # Bandit B105 false positive: "bearer" is the OAuth2 token type (RFC 6750), not a secret
                    "token_type": "bearer", "role": user.role, "point_id": user.point_id,  # nosec B105
                    "expires_in": hours * 3600}

    @app.get("/me", tags=["auth"])
    def me(p: Principal = Depends(current_principal)):
        return {"username": p.username, "role": p.role, "point_id": p.point_id}

    @app.get("/public-key", tags=["auth"])
    def public_key():
        return {"alg": "EdDSA", "public_key": settings.secret("auth_public.b64").decode()}

    @app.post("/users", tags=["admin"], status_code=201)
    def create_user(body: NewUser, _: Principal = Depends(require_roles("Admin"))):
        with sessions() as db:
            if db.scalar(select(User).where(User.username == body.username)):
                raise HTTPException(409, "username already exists")
            user = add_user(db, body.username, body.password, body.role, body.point_id)
            db.commit()
            return _public(user)

    @app.get("/users", tags=["admin"])
    def list_users(_: Principal = Depends(require_roles("Admin"))):
        with sessions() as db:
            return [_public(u) for u in db.scalars(select(User).order_by(User.id))]

    @app.patch("/users/{user_id}", tags=["admin"])
    def update_user(user_id: int, body: UserUpdate, _: Principal = Depends(require_roles("Admin"))):
        with sessions() as db:
            user = db.get(User, user_id)
            if user is None:
                raise HTTPException(404, "user not found")
            if body.active is not None:
                user.active = body.active
            if body.unlock:
                user.failed_logins = 0
            if body.point_id is not None:
                user.point_id = body.point_id
            db.commit()
            return _public(user)

    return app


def get_app():
    return create_app()
