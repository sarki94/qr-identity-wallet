"""Audit & Sync service: receives queued verification records and chains them by hash (FR-24, FR-25, FR-26, NFR-S6).

The agent's identity and distribution point come from the signed token, not
from the request body, so an agent cannot file records in someone else's name.
"""
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import Body, Depends
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, Integer, String, select
from sqlalchemy.orm import Mapped, mapped_column

from qrw_core.audit import GENESIS, ChainEntry, record_hash, verify_chain
from qrw_core.keys import load_public_key_b64

from ..shared.app import base_app
from ..shared.config import Settings
from ..shared.db import Base, make_session_factory
from ..shared.security import Principal, require_roles


MAX_BATCH = 2000  # NFR-C4: a full offline day of records in one upload, and no more


class Record(Base):
    __tablename__ = "records"
    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    record_id: Mapped[str] = mapped_column(String(64), unique=True)
    credential_id: Mapped[str] = mapped_column(String(40), index=True)
    result: Mapped[str] = mapped_column(String(10))
    level: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    point_id: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    agent: Mapped[str] = mapped_column(String(64))
    verified_at: Mapped[str] = mapped_column(String(40))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    prev_hash: Mapped[str] = mapped_column(String(64))
    hash: Mapped[str] = mapped_column(String(64))

    def chained_fields(self) -> dict:
        return {"record_id": self.record_id, "credential_id": self.credential_id, "result": self.result,
                "level": self.level, "reason": self.reason, "point_id": self.point_id, "agent": self.agent,
                "verified_at": self.verified_at}


class RecordIn(BaseModel):
    record_id: str = Field(min_length=8, max_length=64)
    credential_id: str = Field(max_length=40)
    result: str = Field(pattern="^(accepted|rejected)$")
    level: Optional[str] = Field(default=None, pattern="^(L1|L2)$")
    reason: Optional[str] = Field(default=None, max_length=40)
    verified_at: str = Field(max_length=40)


def create_app(settings: Settings = None):
    settings = settings or Settings()
    sessions = make_session_factory(settings.db_url("audit"), Base.metadata)
    app = base_app("audit", settings)
    app.state.auth_public_key = load_public_key_b64(settings.secret("auth_public.b64").decode())
    auditor = require_roles("Auditor", "Admin")

    @app.post("/records", tags=["sync"])
    def upload(batch: List[RecordIn] = Body(..., max_length=MAX_BATCH),
               p: Principal = Depends(require_roles("Agent"))):
        accepted = duplicates = 0
        with sessions() as db:
            last = db.scalar(select(Record).order_by(Record.seq.desc()).limit(1))
            head = last.hash if last else GENESIS
            for item in batch:
                if db.scalar(select(Record.seq).where(Record.record_id == item.record_id)) is not None:
                    duplicates += 1  # idempotent retry after a dropped connection
                    continue
                rec = Record(record_id=item.record_id, credential_id=item.credential_id, result=item.result,
                             level=item.level, reason=item.reason, point_id=p.point_id, agent=p.username,
                             verified_at=item.verified_at, received_at=datetime.now(timezone.utc), prev_hash=head)
                rec.hash = record_hash(rec.chained_fields(), head)
                head = rec.hash
                db.add(rec)
                accepted += 1
            db.commit()
        return {"accepted": accepted, "duplicates": duplicates, "head_hash": head}

    @app.get("/records", tags=["audit"])
    def list_records(result: Optional[str] = None, point_id: Optional[str] = None,
                     credential_id: Optional[str] = None, _: Principal = Depends(auditor)):
        q = select(Record).order_by(Record.seq)
        if result:
            q = q.where(Record.result == result)
        if point_id:
            q = q.where(Record.point_id == point_id)
        if credential_id:
            q = q.where(Record.credential_id == credential_id)
        with sessions() as db:
            return [dict(r.chained_fields(), seq=r.seq, hash=r.hash) for r in db.scalars(q)]

    @app.get("/records/verify-chain", tags=["audit"])
    def check_chain(_: Principal = Depends(auditor)):
        with sessions() as db:
            rows = list(db.scalars(select(Record).order_by(Record.seq)))
            chain = [ChainEntry(r.chained_fields(), r.prev_hash, r.hash) for r in rows]
            broken = verify_chain(chain)
            return {"records": len(chain), "intact": broken is None,
                    "first_broken_seq": rows[broken].seq if broken is not None else None,
                    "head_hash": chain[-1].hash if chain else GENESIS}

    @app.get("/anomalies", tags=["audit"])
    def anomalies(_: Principal = Depends(auditor)):
        """FR-26: the same credential accepted at two different points within 24 hours (possible cloning)."""
        with sessions() as db:
            rows = list(db.scalars(select(Record).where(Record.result == "accepted").order_by(Record.verified_at)))
        flags, by_cred = [], {}
        for r in rows:
            by_cred.setdefault(r.credential_id, []).append(r)
        for cred, recs in by_cred.items():
            for a, b in zip(recs, recs[1:]):
                try:
                    gap = datetime.fromisoformat(b.verified_at) - datetime.fromisoformat(a.verified_at)
                except ValueError:
                    continue
                if a.point_id != b.point_id and gap <= timedelta(hours=24):
                    flags.append({"credential_id": cred, "first": {"point_id": a.point_id, "at": a.verified_at},
                                  "second": {"point_id": b.point_id, "at": b.verified_at}})
        return {"flags": flags}

    return app


def get_app():
    return create_app()
