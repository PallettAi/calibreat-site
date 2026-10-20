#!/usr/bin/env python3
"""Acceptance checks for calibrEAT's cross-page visual refresh."""
from html.parser import HTMLParser
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
PAGES = [p for p in ROOT.glob("*.html") if p.name not in {"404.html"}]


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.marks = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "link":
            self.links.append(attrs)
        if tag == "img" and "data-mark" in attrs:
            self.marks.append(attrs)


def check(ok, description):
    print(("PASS: " if ok else "FAIL: ") + description)
    return ok


def main():
    failures = []
    for page in PAGES:
        source = page.read_text(encoding="utf-8")
        parser = PageParser()
        parser.feed(source)
        failures.append(check(any(link.get("href") == "visual-refresh.css" for link in parser.links),
                              f"{page.name} loads shared visual-refresh.css"))
        if parser.marks:
            failures.append(check("site.js" in source and "data-mark" in source,
                                  f"{page.name} uses the shared enlarged brand mark"))
        if page.name != "support.html":
            failures.append(check('href="support.html"' in source,
                                  f"{page.name} routes support contact to the support page"))

    homepage = (ROOT / "index.html").read_text(encoding="utf-8")
    failures.append(check('class="burn-trend-art"' in homepage and "trend-draw" in homepage,
                          "home phone artwork contains an animated True Burn trend"))
    css = (ROOT / "visual-refresh.css").read_text(encoding="utf-8")
    failures.append(check("prefers-reduced-motion" in css,
                          "shared artwork and motion respect reduced-motion preferences"))
    landing_css = (ROOT / "landing.css").read_text(encoding="utf-8")
    failures.append(check(".landing-brand img { width: 38px; height: 38px; }" in landing_css,
                          "homepage wordmark uses an enlarged icon"))

    support_path = ROOT / "support.html"
    failures.append(check(support_path.exists(), "dedicated support.html exists"))
    if support_path.exists():
        support = support_path.read_text(encoding="utf-8")
        failures.append(check("support@calibreat.co.uk" in support and "mailto:support@calibreat.co.uk" in support,
                              "support page presents a working email contact"))
        failures.append(check("5 working days" in support,
                              "support page states a response within five working days"))
        failures.append(check("support.html" in (ROOT / "sitemap.xml").read_text(encoding="utf-8"),
                              "support page is included in the sitemap"))
    return 0 if all(failures) else 1


if __name__ == "__main__":
    sys.exit(main())
