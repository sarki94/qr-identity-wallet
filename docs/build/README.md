# Building the Word deliverables

The seven deliverables are generated from code so they stay consistent with the repository (requirements catalogue, RTM, UML).

```bash
# 1. Render the UML diagrams (needs Java + PlantUML jar)
java -jar plantuml.jar -tpng -Sdpi=200 -o /path/to/png ../uml/*.puml
# 2. Export the requirements catalogue and regenerate the RTM
python ../../tools/rtm.py
# 3. Generate a document (needs Node.js and the `docx` npm package)
UML_PNG=/path/to/png node srs.js ../deliverables/QRW-SRS-01_Software_Requirements_Specification.docx
# 4. Fill the table of contents and export a PDF (needs LibreOffice)
python3 finalize.py ../deliverables/QRW-SRS-01_Software_Requirements_Specification.docx
```

`lib.js` holds the department style: A4; margins 3.5 cm left, 2.5 cm elsewhere; Times New Roman 12 pt; justified text;
heading tiers; table captions above and figure captions below, numbered by section; APA 7 references.
