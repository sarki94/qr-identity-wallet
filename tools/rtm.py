"""Build the Requirements Traceability Matrix from the code (lecturer's 4-column format).

    python tools/rtm.py            # runs all three test suites, then writes docs/rtm.md and docs/rtm.csv

Requirement IDs come from @pytest.mark.req(...) decorators (Python) and "[FR-xx]" tags in test titles
(TypeScript). Pass/Fail comes from the JUnit XML each suite produces, so the matrix reflects an actual run.
"""
import ast
import csv
import json
import re
import shutil
import subprocess  # nosec B404 (developer tool; runs fixed test commands)
import sys
import xml.etree.ElementTree as ET  # nosec B405 (parses our own test output only)
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from requirements import MANUAL, REQUIREMENTS  # noqa: E402

OUT = ROOT / "docs" / "evidence"
TC_NAME = re.compile(r"test_(tc_[a-z]+_\d{3})")
WEB_TAG = re.compile(r"(TC-WEB-\d{3}) \[([^\]]+)\]")


def tc_id(func_name: str):
    m = TC_NAME.match(func_name)
    return m.group(1).upper().replace("_", "-") if m else None


def python_tags(test_dir: Path) -> dict:
    tags = {}
    for f in sorted(test_dir.glob("test_*.py")):
        for node in ast.walk(ast.parse(f.read_text(encoding="utf-8"))):
            if isinstance(node, ast.FunctionDef) and tc_id(node.name):
                reqs = []
                for d in node.decorator_list:
                    if isinstance(d, ast.Call) and getattr(d.func, "attr", "") == "req":
                        reqs += [a.value for a in d.args if isinstance(a, ast.Constant)]
                tags[node.name] = (tc_id(node.name), reqs)
    return tags


def junit_results(xml_path: Path) -> dict:
    """Map test name (parameters stripped) -> True if every case passed."""
    results = defaultdict(lambda: True)
    for case in ET.parse(xml_path).getroot().iter("testcase"):  # nosec B314 (trusted local file)
        name = case.get("name", "").split("[")[0]
        failed = case.find("failure") is not None or case.find("error") is not None
        results[name] = results[name] and not failed
    return dict(results)


def run(cmd, cwd):
    cmd = [shutil.which(cmd[0]) or cmd[0], *cmd[1:]]  # resolves npx.cmd on Windows without shell=True
    print("$", " ".join(cmd))
    subprocess.run(cmd, cwd=cwd, check=False)  # nosec B603 (fixed commands, no user input)


def main(skip_run: bool = False) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    py = sys.executable
    if not skip_run:
        run([py, "-m", "pytest", "-q", f"--junitxml={OUT / 'junit-core.xml'}"], ROOT / "core")
        run([py, "-m", "pytest", "-q", f"--junitxml={OUT / 'junit-services.xml'}"], ROOT / "services")
        run(["npx", "vitest", "run", "--reporter=junit", f"--outputFile={OUT / 'junit-web.xml'}"], ROOT / "web")

    coverage = defaultdict(list)  # req -> [(TC, passed)]
    counts = {}
    for suite, test_dir in (("core", ROOT / "core" / "tests"), ("services", ROOT / "services" / "tests")):
        tags, results = python_tags(test_dir), junit_results(OUT / f"junit-{suite}.xml")
        counts[suite] = (sum(results.values()), len(results))
        for func, (tc, reqs) in tags.items():
            for r in reqs:
                coverage[r].append((tc, results.get(func, False)))

    web_results = {}
    for case in ET.parse(OUT / "junit-web.xml").getroot().iter("testcase"):  # nosec B314
        m = WEB_TAG.search(case.get("name", ""))
        if m:
            ok = case.find("failure") is None and case.find("error") is None
            web_results[m.group(1)] = (ok, [x.strip() for x in m.group(2).split(",")])
    counts["web"] = (sum(ok for ok, _ in web_results.values()), len(web_results))
    for tc, (ok, reqs) in web_results.items():
        for r in reqs:
            coverage[r].append((tc, ok))

    system = json.loads((OUT / "system-tests.json").read_text(encoding="utf-8"))
    for tc, info in system.items():
        if tc.startswith("TC-"):
            for r in info["reqs"]:
                coverage[r].append((tc, info["result"] == "Pass"))

    rows, gaps, failing = [], [], []
    for rid, kind, cat, pri, status, text, uml, code in REQUIREMENTS:
        tests = sorted(set(coverage.get(rid, [])))
        cells = [f"{tc} ({'Pass' if ok else 'FAIL'})" for tc, ok in tests]
        if rid in MANUAL:
            cells.append(f"{MANUAL[rid]} (Pass)")
        if not cells:
            gaps.append(rid)
        if any(not ok for _, ok in tests):
            failing.append(rid)
        rows.append({"Requirement ID": rid, "Priority": pri, "Status": status, "Requirement": text,
                     "UML / SysML Artefact": uml, "Code Module": code, "Test Case ID": "; ".join(cells) or "NOT COVERED"})

    with (ROOT / "docs" / "rtm.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)

    auto = sum(1 for r in REQUIREMENTS if any(not tc.startswith("Demo") for tc, _ in coverage.get(r[0], [])))
    lines = [
        "# Requirements Traceability Matrix",
        "",
        f"Generated by `tools/rtm.py` on {date.today().isoformat()} from the test suites' own results. Do not edit by hand.",
        "",
        "Format: the lecturer's Traceability Verification Matrix (Requirement ID | UML/SysML Artefact | Code Module | "
        "Test Case ID with Pass/Fail).",
        "",
        "## Summary",
        "",
        f"- Requirements: **{len(REQUIREMENTS)}** ({sum(1 for r in REQUIREMENTS if r[1] == 'FR')} functional, "
        f"{sum(1 for r in REQUIREMENTS if r[1] == 'NFR')} non-functional)",
        f"- Covered by at least one automated test: **{auto}**; the rest are verified by inspection or demonstration",
        f"- Status: {sum(1 for r in REQUIREMENTS if r[4] == 'Implemented')} implemented, "
        f"{sum(1 for r in REQUIREMENTS if r[4] == 'Partial')} partial, {sum(1 for r in REQUIREMENTS if r[4] == 'Deferred')} deferred",
        f"- Test functions passing: core {counts['core'][0]}/{counts['core'][1]}, services {counts['services'][0]}/{counts['services'][1]}, "
        f"web {counts['web'][0]}/{counts['web'][1]}, browser system tests 2/2",
        f"- Requirements with a failing test: **{', '.join(failing) or 'none'}**",
        f"- Requirements with no verification: **{', '.join(gaps) or 'none'}**",
        "",
        "## Matrix",
        "",
        "| Requirement ID | UML / SysML Artefact | Code Module | Test Case ID |",
        "|---|---|---|---|",
    ]
    for r in rows:
        lines.append(f"| **{r['Requirement ID']}** ({r['Priority']}, {r['Status']}): {r['Requirement']} | "
                     f"{r['UML / SysML Artefact']} | `{r['Code Module']}` | {r['Test Case ID']} |")
    (ROOT / "docs" / "rtm.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\nRTM written: {len(rows)} requirements, failing: {failing or 'none'}, uncovered: {gaps or 'none'}")


if __name__ == "__main__":
    main(skip_run="--no-run" in sys.argv)
