"""Open a .docx in LibreOffice, update the table of contents and other indexes, save .docx and .pdf.

Usage: python3 finalize.py in.docx [more.docx ...]
"""
import os
import subprocess
import sys
import time

import uno
from com.sun.star.beans import PropertyValue


def prop(name, value):
    p = PropertyValue()
    p.Name, p.Value = name, value
    return p


def main(files):
    port = 2083
    office = subprocess.Popen(["soffice", "--headless", "--invisible", "--norestore", "--nologo",
                               f"--accept=socket,host=127.0.0.1,port={port};urp;"])
    ctx = uno.getComponentContext()
    resolver = ctx.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", ctx)
    for _ in range(60):
        try:
            remote = resolver.resolve(f"uno:socket,host=127.0.0.1,port={port};urp;StarOffice.ComponentContext")
            break
        except Exception:
            time.sleep(0.5)
    desktop = remote.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", remote)
    try:
        for f in files:
            url = uno.systemPathToFileUrl(os.path.abspath(f))
            doc = desktop.loadComponentFromURL(url, "_blank", 0, (prop("Hidden", True),))
            idx = doc.getDocumentIndexes()
            for i in range(idx.getCount()):
                idx.getByIndex(i).update()
            doc.storeToURL(url, (prop("FilterName", "MS Word 2007 XML"),))
            doc.storeToURL(url[:-5] + ".pdf", (prop("FilterName", "writer_pdf_Export"),))
            doc.close(True)
            print("finalised", f)
    finally:
        try:
            desktop.terminate()
        except Exception:
            pass
        office.wait(timeout=30)


if __name__ == "__main__":
    main(sys.argv[1:])
