"""Charts for QRW-PRM-05: burndown and risk matrix (static PNG for the Word document)."""
import json
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

D = json.loads((Path(__file__).parent / "prm_data.json").read_text())
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent / "figures")
OUT.mkdir(parents=True, exist_ok=True)
INK, MUTED, GRID, SURF = "#1f1f1e", "#6b6b68", "#e4e4e1", "#ffffff"
BLUE, ORANGE = "#2a78d6", "#eb6834"
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10, "axes.edgecolor": MUTED, "text.color": INK,
                     "axes.labelcolor": INK, "xtick.color": MUTED, "ytick.color": MUTED})

# ---- burndown -----------------------------------------------------------------
bac, dates = D["bac"], D["dates"]
planned = [bac - v for v in D["pv"]]
actual = [bac - v for v in D["ev"] if v is not None]
fig, ax = plt.subplots(figsize=(7.5, 3.8), dpi=200)
x = range(len(dates))
ax.plot(x, planned, color=BLUE, lw=2, marker="o", ms=5, label="Planned remaining (BAC − PV)")
ax.plot(range(len(actual)), actual, color=ORANGE, lw=2, marker="o", ms=5, label="Actual remaining (BAC − EV)")
ax.annotate(f"{actual[-1]} pts left\n(4 Nov)", (len(actual) - 1, actual[-1]), xytext=(8, 10),
            textcoords="offset points", color=INK, fontsize=9)
ax.annotate("No sprint work\n31 Oct – 2 Nov", (2, 60), xytext=(0, 12), textcoords="offset points",
            ha="center", color=MUTED, fontsize=9)
ax.set_xticks(list(x), dates)
ax.set_ylabel("Story points remaining")
ax.set_ylim(0, 72)
ax.grid(axis="y", color=GRID, lw=0.8)
ax.set_axisbelow(True)
for s in ("top", "right"):
    ax.spines[s].set_visible(False)
ax.legend(frameon=False, loc="upper right", fontsize=9)
fig.tight_layout()
fig.savefig(OUT / "burndown.png", facecolor=SURF)

# ---- risk matrix --------------------------------------------------------------
def p_level(p):
    return 0 if p < 0.25 else 1 if p <= 0.5 else 2


def i_level(loss):
    return 0 if loss < 2 else 1 if loss <= 7 else 2


tint = {"Green": "#d7efd7", "Yellow": "#fdeec6", "Red": "#f6d2d2"}
fig, ax = plt.subplots(figsize=(6.4, 4.6), dpi=200)
cells = {}
for r in D["risks"]:
    cells.setdefault((p_level(r[3]), i_level(r[4])), []).append(r[0])
for pi in range(3):
    for ii in range(3):
        score = (pi + 1) * (ii + 1)
        tier = "Green" if score <= 2 else "Yellow" if score <= 4 else "Red"
        ax.add_patch(plt.Rectangle((ii, pi), 1, 1, facecolor=tint[tier], edgecolor="white", lw=3))
        ax.text(ii + 0.06, pi + 0.88, tier, fontsize=8, color=MUTED, va="top")
        ids = cells.get((pi, ii), [])
        ax.text(ii + 0.5, pi + 0.45, "\n".join(ids), ha="center", va="center", fontsize=10, color=INK,
                fontweight="bold")
ax.set_xlim(0, 3)
ax.set_ylim(0, 3)
ax.set_xticks([0.5, 1.5, 2.5], ["Low\n(< 2 person-days)", "Medium\n(2–7 person-days)", "High\n(> 7 person-days)"])
ax.set_yticks([0.5, 1.5, 2.5], ["Low\n(P < 0.25)", "Medium\n(0.25–0.5)", "High\n(P > 0.5)"])
ax.set_xlabel("Impact L(risk)")
ax.set_ylabel("Probability P(risk)")
ax.tick_params(length=0)
for s in ax.spines.values():
    s.set_visible(False)
fig.tight_layout()
fig.savefig(OUT / "risk-matrix.png", facecolor=SURF)
print("charts written to", OUT)
