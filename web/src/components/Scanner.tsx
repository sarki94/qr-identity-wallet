import { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";

/** Camera QR scanner with a paste fallback (laptops without a camera, demos, automated tests). */
export function Scanner({ onResult, prompt }: { onResult: (text: string) => void; prompt: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState(false);
  const [error, setError] = useState("");
  const [pasted, setPasted] = useState("");

  useEffect(() => {
    if (!camera || !video.current) return;
    const scanner = new QrScanner(video.current, (r) => { scanner.stop(); setCamera(false); onResult(r.data); },
      { preferredCamera: "environment", highlightScanRegion: true, returnDetailedScanResult: true });
    scanner.start().catch(() => { setError("Camera not available. Use HTTPS on phones, or paste the code below."); setCamera(false); });
    return () => { scanner.stop(); scanner.destroy(); };
  }, [camera, onResult]);

  return (
    <div className="scanner">
      <p className="prompt">{prompt}</p>
      {camera ? <video ref={video} className="video" muted playsInline /> :
        <button className="btn" onClick={() => { setError(""); setCamera(true); }}>Open camera</button>}
      {error && <p className="msg bad">{error}</p>}
      <details>
        <summary>No camera? Paste the code</summary>
        <textarea id="paste-code" value={pasted} onChange={(e) => setPasted(e.target.value)} rows={3} placeholder="QRW1:…" />
        <button className="btn ghost" onClick={() => pasted.trim() && onResult(pasted.trim())}>Use pasted code</button>
      </details>
    </div>
  );
}
