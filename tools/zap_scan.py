"""OWASP ZAP dynamic scan (DAST) of the five running services.

Needs: ZAP running in daemon mode on 127.0.0.1:8090 (api key disabled) and the
services running (python services/scripts/run_local.py). Usage:
    python tools/zap_scan.py docs/evidence/zap
Each service's OpenAPI description is imported so ZAP knows every endpoint, an
authenticated token for a suitable role is added to every request, then ZAP's
passive and active scan rules run against it. Reports: HTML and JSON.
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from zapv2 import ZAPv2

ZAP = ZAPv2(proxies={"http": "http://127.0.0.1:8090", "https": "http://127.0.0.1:8090"})
SERVICES = [  # (name, port, demo account used for the Authorization header)
    ("auth", 8001, ("admin", "Admin#2026!")),
    ("issuer", 8002, ("officer1", "Officer#2026!")),
    ("trust", 8003, None),
    ("audit", 8004, ("auditor1", "Auditor#2026!")),
    ("mock-nimc", 8005, None),
]


def token(user: str, password: str) -> str:
    data = urllib.parse.urlencode({"username": user, "password": password}).encode()
    with urllib.request.urlopen("http://127.0.0.1:8001/token", data=data, timeout=10) as r:  # nosec B310
        return json.load(r)["access_token"]


def wait(fn, label):
    while int(fn()) < 100:
        time.sleep(3)
    print(f"  {label} done")


def main(outdir: str) -> None:
    out = Path(outdir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    ZAP.core.new_session(overwrite="true")
    ZAP.ascan.set_option_max_scan_duration_in_mins(8)
    # log in first: scanning /token trips the login rate limit (as it should)
    tokens = {name: token(*account) for name, _, account in SERVICES if account}
    for name, port, account in SERVICES:
        base = f"http://127.0.0.1:{port}"
        print(f"{name}: {base}")
        ZAP.replacer.remove_rule("auth-header")
        if account:
            ZAP.replacer.add_rule(description="auth-header", enabled="true", matchtype="REQ_HEADER",
                                  matchregex="false", matchstring="Authorization",
                                  replacement="Bearer " + tokens[name])
        ZAP.openapi.import_url(f"{base}/openapi.json")
        ZAP.core.access_url(f"{base}/docs")
        while int(ZAP.pscan.records_to_scan) > 0:
            time.sleep(1)
        scan_id = ZAP.ascan.scan(url=base, recurse=True)
        wait(lambda: ZAP.ascan.status(scan_id), "active scan")
    while int(ZAP.pscan.records_to_scan) > 0:
        time.sleep(1)
    ZAP.replacer.remove_rule("auth-header")
    for template, fname in (("traditional-html", "zap-report.html"), ("traditional-json", "zap-report.json")):
        ZAP.reports.generate(title="QR Identity Wallet services - OWASP ZAP scan", template=template,
                             reportdir=str(out), reportfilename=fname)
    alerts = ZAP.core.alerts()
    summary = {}
    for a in alerts:
        key = (a["risk"], a["alert"], a["pluginId"])
        summary.setdefault(key, set()).add(a["url"].split("?")[0])
    rows = sorted(summary.items(), key=lambda kv: ["High", "Medium", "Low", "Informational"].index(kv[0][0]))
    (out / "zap-summary.json").write_text(json.dumps(
        [{"risk": k[0], "alert": k[1], "plugin": k[2], "urls": sorted(v)} for k, v in rows], indent=2))
    msgs = ZAP.core.number_of_messages()
    print(f"requests sent: {msgs}; distinct alerts: {len(rows)}")
    for (risk, alert, pid), urls in rows:
        print(f"  [{risk}] {alert} ({pid}) x{len(urls)}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "docs/evidence/zap")
