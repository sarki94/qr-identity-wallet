"""Compose phone screenshots side by side for the Word documents (run after the browser system tests)."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SHOTS = Path(__file__).resolve().parents[1] / "screenshots"
FONT = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 32)


def compose(panels, out, height=1300):
    ims = []
    for name, _ in panels:
        im = Image.open(SHOTS / f"{name}.png").convert("RGB")
        im = im.resize((800, int(im.size[1] * 800 / im.size[0]))) if im.size[0] != 800 else im
        canvas = Image.new("RGB", (800, height), (243, 246, 244))
        canvas.paste(im.crop((0, 0, 800, min(height, im.size[1]))), (0, 0))
        ims.append(canvas)
    gap = 30
    sheet = Image.new("RGB", (800 * len(ims) + gap * (len(ims) - 1), height + 70), "white")
    d = ImageDraw.Draw(sheet)
    for i, (im, (_, label)) in enumerate(zip(ims, panels)):
        x = i * (800 + gap)
        sheet.paste(im, (x, 0))
        d.rectangle([x, 0, x + 799, height - 1], outline=(180, 180, 180), width=2)
        d.text((x + (800 - d.textlength(label, font=FONT)) / 2, height + 18), label, fill="black", font=FONT)
    sheet.save(SHOTS / out)


compose([("09-verifier-accepted", "(a) Genuine holder: accepted"),
         ("10-verifier-replay-rejected", "(b) Replayed answer: rejected"),
         ("11-verifier-tampered-rejected", "(c) Edited credential: rejected"),
         ("13-verifier-revoked-rejected", "(d) Revoked credential: rejected")], "verifier-verdicts.png")
compose([("05-verifier-offline-scan", "(a) Synced, now offline: ready to scan"),
         ("06-verifier-challenge", "(b) Verifier shows challenge"),
         ("07-wallet-answer", "(c) Wallet answers after PIN"),
         ("08-verifier-face-check", "(d) Agent checks the face")], "distribution-day-flow.png")
compose([("manual/wallet-new-profile", "(a) Create a profile"),
         ("01-wallet-binding", "(b) Binding code for the officer"),
         ("03-wallet-saved", "(c) Credential saved"),
         ("07-wallet-answer", "(d) Answer for the agent")], "manual/wallet-steps.png", height=1120)
compose([("manual/verifier-login", "(a) Agent signs in"),
         ("04-verifier-synced", "(b) Synced, ready to scan"),
         ("06-verifier-challenge", "(c) Holder check"),
         ("08-verifier-face-check", "(d) Face check")], "manual/verifier-steps.png", height=1300)
print("composites written")
