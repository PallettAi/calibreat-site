/**
 * calibrEAT — site.js
 *
 * Shared behaviour for every page, loaded with <script src="site.js" defer>.
 * This absorbs the block of small scripts that used to be copy-pasted into all
 * nine pages: mark injection, favicon, footer year, theme toggle, mobile nav
 * and scroll reveal. Each page now only carries what is genuinely its own
 * (CHECKOUT_URL / APK_URL / NOTIFY_API_BASE constants and the page's wiring).
 *
 * Behaviour styles live in polish.css. Both are additive and fail safe: with no
 * JS, or under prefers-reduced-motion, pages render complete and static. The
 * scroll reveal hides elements only *after* JS marks them, so a script that
 * never runs can never leave a page blank.
 */
(function () {
  "use strict";

  var doc = document;
  var root = doc.documentElement;
  var reduceMotion = false;
  try {
    reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {}

  /* ── Brand mark ────────────────────────────────────────────────────────
   * Inline data URI rather than a file request, so every page stays
   * self-contained and the mark cannot 404 or arrive late. Colours are the
   * master mark's own (brand/calibreat-mark-line-dark.svg), not restyled here.
   */
  var MARK_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">' +
    '<path d="M 220 370 L 292 370 L 272 335 L 240 335 Z" fill="#B7E93C"/>' +
    '<rect x="206" y="370" width="100" height="12" rx="6" fill="#B7E93C"/>' +
    '<path d="M 315 185 A 75 75 0 1 0 315 315" fill="none" stroke="#B7E93C" stroke-width="22" stroke-linecap="round"/>' +
    '<line x1="130" y1="315" x2="382" y2="245" stroke="#B7E93C" stroke-width="12" stroke-linecap="round"/>' +
    '<g transform="translate(135, 220)">' +
    '<path d="M 25 12 C 32 3, 42 8, 42 8 C 42 8, 38 20, 25 12 Z" fill="#B7E93C"/>' +
    '<path d="M 25 20 C 10 20, 5 33, 5 50 C 5 72, 20 82, 25 82 C 30 82, 45 72, 45 50 C 45 33, 40 20, 25 20 Z" fill="#1F9D55"/>' +
    "</g>" +
    '<g transform="translate(335, 150)">' +
    '<path d="M 25 75 C 10 75, 0 62, 0 45 C 0 28, 15 15, 25 0 C 30 18, 40 25, 40 42 C 40 60, 35 75, 25 75 Z" fill="#1F9D55"/>' +
    '<path d="M 25 75 C 18 75, 12 68, 12 55 C 12 42, 22 32, 25 25 C 28 35, 33 40, 33 52 C 33 65, 30 75, 25 75 Z" fill="#B7E93C"/>' +
    "</g>" +
    "</svg>";

  var MARK_URI = "data:image/svg+xml;utf8," + encodeURIComponent(MARK_SVG);

  Array.prototype.forEach.call(doc.querySelectorAll("img[data-mark]"), function (img) {
    img.src = MARK_URI;
  });
  var favicon = doc.querySelector('link[rel="icon"][type="image/svg+xml"]');
  if (favicon) favicon.setAttribute("href", MARK_URI);

  /* ── Footer year ─────────────────────────────────────────────────────── */
  var year = doc.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  /* ── Theme ─────────────────────────────────────────────────────────────
   * Dark is the product default. The blocking script in each page's <head>
   * has already restored a saved light choice before first paint; this only
   * takes over afterwards, so switching never flashes.
   */
  var themeBtn = doc.getElementById("theme-toggle");
  var themeMeta = doc.querySelector('meta[name="theme-color"]');
  var GROUNDS = { light: "#F5F6F2", dark: "#0B0F0C" };

  var applyTheme = function (t) {
    root.setAttribute("data-theme", t);
    try { localStorage.setItem("calibreat-theme", t); } catch (e) {}
    if (themeMeta) themeMeta.setAttribute("content", GROUNDS[t] || GROUNDS.dark);
  };

  applyTheme(root.getAttribute("data-theme") || "dark");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      applyTheme(root.getAttribute("data-theme") === "light" ? "dark" : "light");
    });
  }

  /* ── Mobile nav ──────────────────────────────────────────────────────── */
  var nav = doc.getElementById("site-nav");
  var burger = doc.getElementById("nav-burger");

  if (nav && burger) {
    var syncNavH = function () {
      root.style.setProperty("--nav-h", nav.getBoundingClientRect().height + "px");
    };
    var setOpen = function (open) {
      nav.classList.toggle("open", open);
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "Close menu" : "Menu");
      doc.body.classList.toggle("nav-menu-open", open);
      if (open) syncNavH();
      else root.style.removeProperty("--nav-h");
    };

    burger.addEventListener("click", function () {
      setOpen(!nav.classList.contains("open"));
    });
    Array.prototype.forEach.call(nav.querySelectorAll("a"), function (a) {
      a.addEventListener("click", function () { setOpen(false); });
    });
    doc.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setOpen(false);
    });
    doc.addEventListener("click", function (e) {
      if (nav.classList.contains("open") && !nav.contains(e.target)) setOpen(false);
    });
    window.addEventListener("resize", function () {
      if (nav.classList.contains("open")) syncNavH();
    });
  }

  /* ── Scroll reveal ─────────────────────────────────────────────────────
   * .pre-reveal is added by JS and swapped for .revealed on entry, so the
   * hidden state can never be the resting state.
   */
  if (!reduceMotion && "IntersectionObserver" in window) {
    var revealables = doc.querySelectorAll(".reveal");
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("revealed");
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.06 }
    );

    Array.prototype.forEach.call(revealables, function (el) {
      var top = el.getBoundingClientRect().top;
      // Anything already on screen renders complete — no fake entrance on load.
      if (top < window.innerHeight * 0.85) {
        el.classList.add("revealed");
        return;
      }
      el.classList.add("pre-reveal");
      observer.observe(el);
      // Safety net, but only for what the observer should have reached almost
      // at once. Unscoped, this fired for every element on the page in the same
      // frame at 1.6s — which quietly defeated the scroll reveal it was
      // guarding, and animated ~30 nodes together behind the nav's blur. What is
      // genuinely far down the page is the observer's job; the net exists for a
      // layout where it never fires at all, and three viewports is close enough
      // that a reader is about to see it either way.
      if (top < window.innerHeight * 3) {
        setTimeout(function () { el.classList.add("revealed"); }, 1600);
      }
    });
  }
})();
