import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

/** Renders a QR code plus a "Copy code" button, so one laptop can play every device using the paste fallback. */
export function QrCode({ text, size = 280, label }: { text: string; size?: number; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState("");
  useEffect(() => {
    if (ref.current) QRCode.toCanvas(ref.current, text, { errorCorrectionLevel: "L", margin: 2, width: size }).catch(() => undefined);
  }, [text, size]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("Copied. Paste it on the other screen.");
    } catch {
      setCopied("Copy blocked by the browser. Select the text below instead.");
    }
  }
  return (
    <figure className="qr" data-qr={text}>
      <canvas ref={ref} aria-label={label || "QR code"} />
      {label && <figcaption>{label}</figcaption>}
      <button type="button" className="btn ghost small noprint" onClick={copy}>Copy code</button>
      {copied && <span className="sub noprint">{copied}</span>}
      {copied.startsWith("Copy blocked") && <textarea className="noprint" readOnly value={text} rows={3} onFocus={(e) => e.target.select()} />}
    </figure>
  );
}
