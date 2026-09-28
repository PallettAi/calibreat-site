"""Contrast audit for the site palette. Run: python3 scripts/check-contrast.py

Parses the real token values out of apps/web/site.css (not a hardcoded copy) and
checks every text token against every ground it can actually land on, in both
themes. Exits non-zero if any pairing drops below WCAG AA.
"""
import re
import pathlib
import sys

WEB = pathlib.Path(__file__).resolve().parent.parent / "apps" / "web"
css = (WEB / "site.css").read_text(encoding="utf-8")
css_nc = re.sub(r"/\*.*?\*/", "", css, flags=re.S)


def block(sel):
    m = re.search(re.escape(sel) + r"\s*\{(.*?)\n\}", css_nc, flags=re.S)
    if not m:
        raise SystemExit("could not find block: " + sel)
    return dict(re.findall(r"(--[\w-]+):\s*(#[0-9A-Fa-f]{6})", m.group(1)))


dark = block(":root")
light = block('[data-theme="light"]')


def lin(c):
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def L(h):
    h = h.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def ratio(a, b):
    la, lb = L(a), L(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


TOKENS = ["text", "text-2", "muted", "faint", "emerald", "brass"]
GROUNDS = ["ink", "surface", "surface-2"]


def tok(pal, name):
    return pal["--" + name]

fails = []
print(f"{'token':16s} {'value':9s} " + "".join(f"{g:>12s}" for g in GROUNDS))
print("-" * 64)
for name, pal in (("DARK", dark), ("LIGHT", light)):
    for tok_ in TOKENS:
        fg = tok(pal, tok_)
        row = f"{name:5s} {tok_:10s} {fg:8s}"
        for g in GROUNDS:
            r = ratio(fg, tok(pal, g))
            mark = "" if r >= 4.5 else " XX"
            if r < 4.5:
                fails.append((name, tok_, g, round(r, 2)))
            row += f"{r:10.2f}{mark:>2s}"
        print(row)
    print("-" * 64)

extras = [
    ("CTA label on forest", "#FFFFFF", dark["--forest"]),
    ("brass-fill button label", "#17130A", dark["--brass-lit"]),
    ("phone screen body text", "#C0CBC3", "#0B0F0C"),
    ("phone screen subtitle", "#7E8C83", "#0B0F0C"),
    ("phone screen link", "#7C8A80", "#0B0F0C"),
    ("statusbar", "#DDE5EA", "#0B0F0C"),
]
print()
for label, fg, bg in extras:
    r = ratio(fg, bg)
    if r < 4.5:
        fails.append((label, "-", "-", round(r, 2)))
    print(f"{label:26s} {r:6.2f}  {'AA' if r >= 4.5 else 'BELOW AA'}")

print()
if fails:
    print("SUB-AA:", len(fails))
    for f in fails:
        print("   ", f)
    sys.exit(1)
else:
    print("All text pairings clear WCAG AA (4.5:1).")
