#!/usr/bin/env python3
"""Acceptance checks for calibrEAT's single-page marketing homepage."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
import sys

PAGE = Path(__file__).resolve().parents[1] / "index.html"


class LandingParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.elements = []

    def handle_starttag(self, tag, attrs):
        self.elements.append((tag, dict(attrs)))


def check(condition, description):
    print(("PASS: " if condition else "FAIL: ") + description)
    return condition


def main():
    source = PAGE.read_text(encoding="utf-8")
    styles = (PAGE.parent / "landing.css").read_text(encoding="utf-8") if (PAGE.parent / "landing.css").exists() else ""
    parser = LandingParser()
    parser.feed(source)
    elements = parser.elements
    sections = [(tag, attrs) for tag, attrs in elements if tag == "section"]
    stores = [attrs for _, attrs in elements if "data-store" in attrs]
    html_links = [attrs.get("href", "") for _, attrs in elements if attrs.get("href", "").endswith(".html")]
    local_refs = [
        (tag, attr, attrs[attr])
        for tag, attrs in elements
        for attr in ("href", "src")
        if attrs.get(attr) and not attrs[attr].startswith(("http:", "https:", "mailto:", "data:", "#", "//"))
    ]
    missing_refs = [
        value for _, _, value in local_refs
        if not (PAGE.parent / urlparse(value).path.lstrip("/")).exists()
    ]
    checks = [
        check(source.count("<main") == source.count("</main>") == 1, "exactly one main landing experience"),
        check(len(sections) >= 4, "single scrollable page has distinct content sections"),
        check(not any(tag == "nav" for tag, _ in elements), "no navigation bar"),
        check(not any(tag == "header" for tag, _ in elements), "no top header/navigation wrapper"),
        check({attrs.get("data-store") for attrs in stores} == {"apple", "google"}, "App Store and Google Play controls exist"),
        check(len(stores) == 4, "both platforms appear in the hero and closing call to action"),
        check(all(tag == "button" for tag, attrs in elements if "data-store" in attrs), "store controls are buttons until the real listings exist"),
        check(all("disabled" in attrs and "href" not in attrs for attrs in stores), "coming-soon store buttons cannot navigate to a fake URL"),
        check(all("Coming soon" in attrs.get("aria-label", "") for attrs in stores), "store state is available to assistive technology"),
        check(source.count("Coming soon</span>") == 4, "each visible store button says Coming soon"),
        check("No in-app purchases" in source and "No subscriptions" in source, "homepage explicitly commits to no in-app purchases or subscriptions"),
        check("CHECKOUT_URL" not in source and "dodopayments.com" not in source and "£4.99" not in source, "old checkout and website price removed"),
        check(not any(link.endswith(".html") and link not in {"privacy.html", "support.html"} for link in html_links), "no navigation to old marketing pages"),
        check({"privacy.html"}.issubset(set(html_links)), "privacy policy remains available from the footer"),
        check('href="support.html"' in source, "support contact routes to the dedicated support page"),
        check("data-mark" in source and "site.js" in source, "existing calibrEAT logo injection is retained"),
        check("true burn" in source.lower(), "the distinctive True Burn feature remains represented"),
        check("landing.css" in source and "#1f9d55" in styles.lower() and "#b7e93c" in styles.lower(), "homepage-scoped styles use existing calibrEAT colors"),
        check("prefers-reduced-motion" in styles, "decorative animation respects reduced-motion preferences"),
        check("aria-labelledby=" in source and "aria-hidden=\"true\"" in source, "sections and decorative artwork are accessible"),
        check("script.js" in source, "pre-existing in-progress script inclusion is retained"),
        check("canonical" in source and "apple-touch-icon" in source and "og:image" in source, "canonical, app icon, and social metadata remain"),
        check(not missing_refs, "all local assets and linked pages resolve" + (" (missing: " + ", ".join(missing_refs) + ")" if missing_refs else "")),
        check("<svg class=\"orbit-art\"" in source and "appleSkin" in source, "original custom hero artwork is embedded on the page"),
        check(".daily-phone" in styles and "story-section" in styles and "closing-section" in styles, "all single-page story sections have dedicated responsive styling"),
        check("<div class=\"daily-phone food-entry-phone\"" in source, "product phone shows the food-entry screen"),
        check("Add food" in source and "Greek yoghurt" in source, "food-entry screen includes the real meal logging flow and named food"),
        check(all(label in source for label in ("CALORIES", "PROTEIN", "CARBS", "FAT")), "food-entry screen exposes calories and all three macros"),
        check("food-entry-macros" in styles and "food-entry-phone" in styles, "food-entry macro values have phone-specific styling"),
        check("Daily log" not in source and "YOUR WEEK" not in source, "placeholder diary dashboard removed from the phone artwork"),
        check(source.count('class="story-item"') == 6, "feature overview contains six detailed feature cards"),
        check(all(label in source for label in ("Food, made easier", "Calories &amp; macros", "Water, made simple", "True Burn", "Workouts", "Fasting")), "feature cards cover food, nutrition, hydration, burn, workouts and fasting"),
        check(all(label in source for label in ("barcode", "nutrition label", "recipe", "weigh-in", "daily targets", "millilitres", "milestones", "equipment and muscle group")), "feature details describe supported app capabilities"),
        check("story-grid" in styles and "@media (max-width: 700px)" in styles, "feature overview uses a responsive card-grid layout"),
        check("<div class=\"daily-phone food-entry-phone\"" in source and "aria-hidden=\"true\"" in source[source.find('<div class="daily-art"'):source.find('<div class="daily-copy"')], "phone illustration remains decorative to screen readers"),
        check("More than<br />a food diary." in source and all(label in source for label in ("Meals &amp; nutrients", "Water &amp; weight", "Training &amp; fasting")), "product preview headline and details match the six-feature section"),
        check("True Burn learns from your trend." in source and "Consistent food logs and weigh-ins help refine your estimate over time." in source, "product preview explains what True Burn learns from"),
        check("data-reveal" in source and "data-reveal" in styles and "IntersectionObserver" in source, "page sections reveal on scroll with a no-script visible fallback"),
        check("prefers-reduced-motion" in styles and "data-reveal" in styles[styles.index("@media (prefers-reduced-motion") :], "all new motion is disabled for reduced-motion preferences"),

    ]
    return 0 if all(checks) else 1


if __name__ == "__main__":
    sys.exit(main())
