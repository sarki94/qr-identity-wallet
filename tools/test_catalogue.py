"""Build the test-case catalogue used by the Test Plan & Report (QRW-TST-04).

Reads every test (Python and web), its TC ID, requirement tags, level and docstring,
plus the JUnit results in docs/evidence, and writes docs/build/testcases.json.
Run tools/rtm.py first so the JUnit files are fresh.
"""
import ast
import json
import re
import sys
import xml.etree.ElementTree as ET  # nosec B405 (trusted local JUnit files)
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from rtm import WEB_TAG, tc_id  # noqa: E402

EVID = ROOT / "docs" / "evidence"
LEVEL = {  # test file -> (level, technique)
    "test_encoding": ("Unit", "Example-based (RFC vectors)"),
    "test_credential": ("Unit", "Example-based"),
    "test_qr": ("Unit", "Example-based"),
    "test_challenge": ("Unit", "Example-based"),
    "test_revocation": ("Unit", "Example-based"),
    "test_audit": ("Unit", "Example-based"),
    "test_keys_and_validation": ("Unit", "Example-based"),
    "test_performance": ("Unit (performance)", "Measurement"),
    "test_auth": ("Integration", "API black-box"),
    "test_issuer_trust": ("Integration", "API black-box"),
    "test_audit_service": ("Integration", "API black-box"),
    "test_system_e2e": ("System (API)", "End-to-end scenario"),
    "test_security": ("Security", "DAST-style black-box"),
    "test_performance_capacity": ("Integration (performance)", "Measurement"),
}


def human(name: str) -> str:
    text = re.sub(r"^test_tc_[a-z]+_\d{3}_", "", name).replace("_", " ")
    words = {"nin": "NIN", "l1": "L1", "l2": "L2", "qr": "QR", "jwt": "JWT", "api": "API", "id": "ID", "ids": "IDs",
             "nimc": "NIMC", "cors": "CORS", "csp": "CSP", "rfc": "RFC", "pin": "PIN",
             "rfc9285": "RFC 9285", "eddsa": "EdDSA", "128": "128-"}
    text = " ".join(words.get(w, w) for w in text.split()).replace("128- bit", "128-bit")
    return text[0].upper() + text[1:]


def junit(path: Path) -> dict:
    res = defaultdict(lambda: {"cases": 0, "failed": 0, "time": 0.0})
    for c in ET.parse(path).getroot().iter("testcase"):  # nosec B314
        r = res[c.get("name", "").split("[")[0]]
        r["cases"] += 1
        r["time"] += float(c.get("time", 0) or 0)
        r["failed"] += int(c.find("failure") is not None or c.find("error") is not None)
    return res


def main() -> None:
    out = []
    for suite in ("core", "services"):
        results = junit(EVID / f"junit-{suite}.xml")
        for f in sorted((ROOT / suite / "tests").glob("test_*.py")):
            level, technique = LEVEL.get(f.stem, ("Unit", "Example-based"))
            for node in ast.walk(ast.parse(f.read_text(encoding="utf-8"))):
                if not (isinstance(node, ast.FunctionDef) and tc_id(node.name)):
                    continue
                reqs, prop = [], False
                for d in node.decorator_list:
                    if isinstance(d, ast.Call) and getattr(d.func, "attr", "") == "req":
                        reqs += [a.value for a in d.args if isinstance(a, ast.Constant)]
                    if isinstance(d, ast.Call) and getattr(d.func, "id", "") == "given":
                        prop = True
                doc = ast.get_docstring(node)
                r = results.get(node.name, {"cases": 0, "failed": 1, "time": 0})
                out.append({"id": tc_id(node.name), "suite": suite, "file": f"{suite}/tests/{f.name}",
                            "level": level, "technique": "Property-based (Hypothesis)" if prop else technique,
                            "title": human(node.name), "note": doc or "", "reqs": reqs,
                            "cases": r["cases"], "result": "Pass" if r["cases"] and not r["failed"] else "Fail",
                            "time": round(r["time"], 3)})
    for c in ET.parse(EVID / "junit-web.xml").getroot().iter("testcase"):  # nosec B314
        m = WEB_TAG.search(c.get("name", ""))
        if m:
            title = c.get("name").split("] ", 1)[1]
            out.append({"id": m.group(1), "suite": "web", "file": c.get("classname", "web/tests"),
                        "level": "Unit (browser library)", "technique": "Cross-implementation vectors",
                        "title": title[0].upper() + title[1:], "reqs": [x.strip() for x in m.group(2).split(",")],
                        "cases": 1, "result": "Fail" if c.find("failure") is not None else "Pass",
                        "time": round(float(c.get("time", 0) or 0), 3)})
    system = json.loads((EVID / "system-tests.json").read_text(encoding="utf-8"))
    for tc, info in system.items():
        if tc.startswith("TC-"):
            out.append({"id": tc, "suite": "e2e", "file": "web/e2e", "level": "System (browser)",
                        "technique": "Playwright scenario", "title": info["title"], "reqs": info["reqs"],
                        "cases": int(info["checks"].split("/")[1]), "result": info["result"], "time": None})
    out.sort(key=lambda t: (["core", "services", "web", "e2e"].index(t["suite"]), t["id"]))
    (ROOT / "docs" / "build" / "testcases.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    by = defaultdict(lambda: [0, 0, 0])
    for t in out:
        by[t["level"]][0] += 1
        by[t["level"]][1] += t["cases"]
        by[t["level"]][2] += t["result"] == "Pass"
    print(f"{len(out)} test cases")
    for k, v in by.items():
        print(f"  {k:28s} TCs {v[0]:3d}  executed {v[1]:3d}  pass {v[2]}")


if __name__ == "__main__":
    main()
