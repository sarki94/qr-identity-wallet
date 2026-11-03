import { useEffect, useRef } from "react";
import QRCode from "qrcode";

export function QrCode({ text, size = 280, label }: { text: string; size?: number; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) QRCode.toCanvas(ref.current, text, { errorCorrectionLevel: "L", margin: 2, width: size }).catch(() => undefined);
  }, [text, size]);
  return (
    <figure className="qr" data-qr={text}>
      <canvas ref={ref} aria-label={label || "QR code"} />
      {label && <figcaption>{label}</figcaption>}
    </figure>
  );
}
