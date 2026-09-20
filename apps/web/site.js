/**
 * Shared site enhancements (loaded by every page with <script src="site.js" defer>).
 * Behaviour styles live in polish.css; both are additive — without JS or under
 * prefers-reduced-motion, pages render exactly as before.
 *
 * Scroll reveals: site.js adds `.pre-reveal` to below-fold `.reveal` elements
 * (hiding is JS-driven, so a page can never be blank without JS) and swaps it
 * for `.revealed` as the element enters the viewport.
 */
(function () {
  "use strict";

  var reduceMotion = false;
  try {
    reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {}
  if (reduceMotion || !("IntersectionObserver" in window)) return;

  var revealables = document.querySelectorAll(".reveal");
  if (!revealables.length) return;

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
    // Anything the user can already see renders complete — no fake entrance on load.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.85) {
      el.classList.add("revealed");
      return;
    }
    el.classList.add("pre-reveal");
    observer.observe(el);
    // Safety net: an element must never stay invisible on a quirky layout.
    setTimeout(function () {
      el.classList.add("revealed");
    }, 1600);
  });
})();
