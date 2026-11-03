"""Audit & Sync service (FR-24, FR-25, FR-26, NFR-S6)."""
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone

import pytest


def rec(cred="cred-1", result="accepted", at=None, level="L2"):
    return {"record_id": uuid.uuid4().hex, "credential_id": cred, "result": result, "level": level,
            "verified_at": (at or datetime.now(timezone.utc)).isoformat()}


@pytest.mark.req("FR-24", "FR-22")
def test_tc_svc_030_batch_upload_is_chained_and_idempotent(system, tokens):
    batch = [rec(), rec(result="rejected"), rec()]
    r = system["audit"].post("/records", json=batch, headers=tokens["agent1"]).json()
    assert r["accepted"] == 3 and r["duplicates"] == 0
    again = system["audit"].post("/records", json=batch, headers=tokens["agent1"]).json()
    assert again["accepted"] == 0 and again["duplicates"] == 3 and again["head_hash"] == r["head_hash"]
    rows = system["audit"].get("/records", headers=tokens["auditor1"]).json()
    assert {x["agent"] for x in rows} == {"agent1"} and {x["point_id"] for x in rows} == {"KURA-01"}


@pytest.mark.req("FR-25", "NFR-S6")
def test_tc_svc_031_tampering_in_the_database_is_detected(system, tokens):
    system["audit"].post("/records", json=[rec(), rec(), rec()], headers=tokens["agent1"])
    assert system["audit"].get("/records/verify-chain", headers=tokens["auditor1"]).json()["intact"]
    db = system["settings"].data_dir / "audit.db"
    with sqlite3.connect(db) as conn:
        conn.execute("UPDATE records SET result='accepted' WHERE seq=2")
        conn.execute("UPDATE records SET result='rejected' WHERE seq=1")
    report = system["audit"].get("/records/verify-chain", headers=tokens["auditor1"]).json()
    assert report["intact"] is False and report["first_broken_seq"] == 1


@pytest.mark.req("FR-25")
def test_tc_svc_032_auditor_filters_records(system, tokens):
    system["audit"].post("/records", json=[rec(result="rejected"), rec()], headers=tokens["agent1"])
    rejected = system["audit"].get("/records?result=rejected", headers=tokens["auditor1"]).json()
    assert len(rejected) == 1 and rejected[0]["result"] == "rejected"


@pytest.mark.req("FR-26")
def test_tc_svc_033_same_credential_at_two_points_within_24h_is_flagged(system, tokens):
    t0 = datetime.now(timezone.utc)
    system["audit"].post("/records", json=[rec("cred-clone", at=t0)], headers=tokens["agent1"])
    system["audit"].post("/records", json=[rec("cred-clone", at=t0 + timedelta(hours=3))], headers=tokens["agent2"])
    system["audit"].post("/records", json=[rec("cred-fine", at=t0)], headers=tokens["agent1"])
    flags = system["audit"].get("/anomalies", headers=tokens["auditor1"]).json()["flags"]
    assert [f["credential_id"] for f in flags] == ["cred-clone"]
