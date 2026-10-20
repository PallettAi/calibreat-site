"""Render the Play Store graphics from slides.html into out/.

Usage: python3 docs/play-store/render.py
Needs: pip install playwright && python -m playwright install chromium
"""
import os
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "out")
os.makedirs(OUT, exist_ok=True)

targets = [
    ("shot-1", "phone-1-home.png"),
    ("shot-2", "phone-2-macros.png"),
    ("shot-3", "phone-3-train.png"),
    ("shot-4", "phone-4-trends.png"),
    ("feature", "feature-graphic-1024x500.png"),
    ("icon", "icon-512.png"),
]

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1200, "height": 2000}, device_scale_factor=1)
    page.goto("file://" + os.path.join(ROOT, "slides.html"))
    page.wait_for_load_state("load")
    page.evaluate("document.fonts && document.fonts.ready")
    for el_id, name in targets:
        page.locator("#" + el_id).screenshot(path=os.path.join(OUT, name))
        print("wrote", name)
    browser.close()
