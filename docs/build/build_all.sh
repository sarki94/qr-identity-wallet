#!/usr/bin/env bash
# Rebuild every Word/PDF deliverable. Needs UML_PNG (folder of rendered PlantUML PNGs), Node, Python and LibreOffice.
set -euo pipefail
cd "$(dirname "$0")"
: "${UML_PNG:?set UML_PNG to the folder of rendered UML PNGs}"
python3 charts.py
python3 compose.py
for pair in "srs:QRW-SRS-01_Software_Requirements_Specification" "sdd:QRW-SDD-02_Software_Design_Document" \
            "sec:QRW-SEC-03_Security_Engineering_Report" "tst:QRW-TST-04_Test_Plan_and_Report" \
            "prm:QRW-PRM-05_Project_Risk_and_Maintenance_Plan" "usr:QRW-USR-06_User_Manual_and_Installation_Guide" \
            "tr:QRW-TR-07_Technical_Report"; do
  js="${pair%%:*}"; out="../deliverables/${pair#*:}.docx"
  [ -f "$js.js" ] || continue
  node "$js.js" "$out" >/dev/null
  python3 finalize.py "$out" >/dev/null
  echo "$(pdfinfo "${out%.docx}.pdf" | awk '/Pages/ {print $2}') pages  $out"
done
