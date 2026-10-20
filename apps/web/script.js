/**
 * calibrEAT — script.js
 *
 * Interactive hardware telemetry & feature choreography for the marketing site:
 * - Drives the live OLED instrument inside the hero phone mockup (True Burn dial,
 *   macro bars, and telemetry readout card).
 * - Syncs with user interaction: clicking the 4 mode tabs inside the phone,
 *   hovering/clicking any of the 12 features in the ledger, or scrolling through
 *   the feature ledger.
 * - Gently cycles through instrument states when idle, pausing immediately on
 *   user interaction or when prefers-reduced-motion is enabled.
 */
(function () {
  "use strict";

  var reduceMotion = false;
  try {
    reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {}

  var TELEMETRY = [
    {
      id: "burn",
      tab: "burn",
      kicker: "01 · TRUE BURN ENGINE",
      badge: "+65 kcal/d",
      title: "True Burn Learning",
      detail: "14-day intake vs scale trend nudges daily expenditure to 2,410 kcal.",
      kcal: "1,840",
      sub: "OF 2,410 KCAL · 570 LEFT",
      burnTag: "TRUE BURN · 2,410 KCAL/D",
      arcOffset: "48",
      macros: [
        { val: "148g", pct: "84%" },
        { val: "186g", pct: "72%" },
        { val: "54g", pct: "76%" }
      ]
    },
    {
      id: "diary",
      tab: "diary",
      kicker: "02 · FOOD DIARY",
      badge: "2-tap repeat",
      title: "Saved Meals & Slots",
      detail: "Breakfast, Lunch, Dinner & Snacks logged locally in SQLite with instant repeat.",
      kcal: "1,620",
      sub: "OF 2,410 KCAL · 790 LEFT",
      burnTag: "SAVED MEAL · +540 KCAL",
      arcOffset: "68",
      macros: [
        { val: "132g", pct: "75%" },
        { val: "164g", pct: "64%" },
        { val: "48g", pct: "68%" }
      ]
    },
    {
      id: "barcode",
      tab: "scan",
      kicker: "03 · BARCODE & COFID",
      badge: "EAN-13 · 42ms",
      title: "Open Food Facts + UK CoFID",
      detail: "Instant barcode lookup plus 2,900+ offline UK composition table entries.",
      kcal: "1,910",
      sub: "OF 2,410 KCAL · 500 LEFT",
      burnTag: "SCAN LOCK · GREEK YOGHURT",
      arcOffset: "42",
      macros: [
        { val: "162g", pct: "92%" },
        { val: "190g", pct: "74%" },
        { val: "56g", pct: "79%" }
      ]
    },
    {
      id: "label",
      tab: "scan",
      kicker: "04 · ON-DEVICE OCR",
      badge: "0 bytes sent",
      title: "Label & Recipe Import",
      detail: "Reads nutrition tables straight off packaging photos on your phone, or imports URLs.",
      kcal: "2,045",
      sub: "OF 2,410 KCAL · 365 LEFT",
      burnTag: "OCR PARSED · 100G / SERVING",
      arcOffset: "32",
      macros: [
        { val: "168g", pct: "95%" },
        { val: "212g", pct: "82%" },
        { val: "59g", pct: "84%" }
      ]
    },
    {
      id: "weight",
      tab: "burn",
      kicker: "05 · SCALE CALIBRATION",
      badge: "-0.4 kg / wk",
      title: "Weight & Healthy BMI Band",
      detail: "Smoothed trend line separates water fluctuations from real tissue change.",
      kcal: "1,840",
      sub: "TARGET PACE · -0.45 KG/WK",
      burnTag: "TREND · 76.4 KG (-1.8 KG)",
      arcOffset: "48",
      macros: [
        { val: "154g", pct: "88%" },
        { val: "180g", pct: "70%" },
        { val: "52g", pct: "74%" }
      ]
    },
    {
      id: "water",
      tab: "diary",
      kicker: "06 · HYDRATION",
      badge: "2,250 / 2,500 ml",
      title: "Daily Water Instrument",
      detail: "One-tap +250 ml & +500 ml vessels tracked alongside your daily food log.",
      kcal: "1,840",
      sub: "HYDRATION · 90% OF GOAL",
      burnTag: "WATER · 2.25 L LOGGED",
      arcOffset: "24",
      macros: [
        { val: "148g", pct: "84%" },
        { val: "186g", pct: "72%" },
        { val: "54g", pct: "76%" }
      ]
    },
    {
      id: "workout",
      tab: "train",
      kicker: "07 · STRENGTH & BURN",
      badge: "+310 kcal burn",
      title: "Muscle Map & Session Log",
      detail: "Sets and reps estimate net session burn from your BMR and widen today's budget.",
      kcal: "2,150",
      sub: "OF 2,720 KCAL · +310 WORKOUT",
      burnTag: "UPPER PUSH · 18 SETS",
      arcOffset: "44",
      macros: [
        { val: "175g", pct: "98%" },
        { val: "230g", pct: "88%" },
        { val: "58g", pct: "82%" }
      ]
    },
    {
      id: "fasting",
      tab: "train",
      kicker: "08 · FASTING CLOCK",
      badge: "16:8 window",
      title: "Milestone Fasting Timer",
      detail: "Clean elapsed timer with 12h, 16h, 18h, 20h and 24h markers — zero guilt.",
      kcal: "1,840",
      sub: "FASTING · 16H 14M ELAPSED",
      burnTag: "WINDOW · 16H MILESTONE",
      arcOffset: "36",
      macros: [
        { val: "148g", pct: "84%" },
        { val: "186g", pct: "72%" },
        { val: "54g", pct: "76%" }
      ]
    },
    {
      id: "streaks",
      tab: "diary",
      kicker: "09 · CONSISTENCY",
      badge: "24-day streak",
      title: "Streaks & Local Reminders",
      detail: "Quiet on-device notifications for meal logging and morning weigh-ins.",
      kcal: "1,840",
      sub: "STREAK · 24 DAYS CALIBRATED",
      burnTag: "REMINDER · 08:00 WEIGH-IN",
      arcOffset: "48",
      macros: [
        { val: "148g", pct: "84%" },
        { val: "186g", pct: "72%" },
        { val: "54g", pct: "76%" }
      ]
    },
    {
      id: "macros",
      tab: "burn",
      kicker: "10 · FULL NUTRIENT SPEC",
      badge: "7 tracked",
      title: "Macros, Fibre, Sugar & Salt",
      detail: "Protein, carbs and fat plus fibre, sugars, saturates and sodium per meal.",
      kcal: "1,890",
      sub: "FIBRE 31G · SODIUM 1.8G",
      burnTag: "PROTEIN TARGET · 96% HIT",
      arcOffset: "40",
      macros: [
        { val: "168g", pct: "96%" },
        { val: "188g", pct: "73%" },
        { val: "53g", pct: "75%" }
      ]
    },
    {
      id: "export",
      tab: "scan",
      kicker: "11 · ZERO LOCK-IN",
      badge: "JSON + CSV",
      title: "1-Tap Full Data Export",
      detail: "Export your complete SQLite history as portable JSON or spreadsheet CSV anytime.",
      kcal: "1,840",
      sub: "BACKUP · PORTABLE JSON/CSV",
      burnTag: "OWNERSHIP · 100% YOURS",
      arcOffset: "48",
      macros: [
        { val: "148g", pct: "84%" },
        { val: "186g", pct: "72%" },
        { val: "54g", pct: "76%" }
      ]
    },
    {
      id: "privacy",
      tab: "burn",
      kicker: "12 · LOCAL-FIRST ARCHITECTURE",
      badge: "SQLite local",
      title: "Private by Design",
      detail: "No account to create, no cloud diary, no ad SDKs, and zero behavioural tracking.",
      kcal: "1,840",
      sub: "STORAGE · ON-DEVICE SQLITE",
      burnTag: "CLOUD SYNC · OFF BY DESIGN",
      arcOffset: "48",
      macros: [
        { val: "148g", pct: "84%" },
        { val: "186g", pct: "72%" },
        { val: "54g", pct: "76%" }
      ]
    }
  ];

  var TAB_TO_INDEX = {
    burn: 0,
    diary: 1,
    scan: 2,
    train: 6
  };

  function init() {
    var phoneScreen = document.querySelector(".phone-screen");
    var features = document.querySelectorAll(".feature");
    if (!phoneScreen) return;

    var elKicker = document.getElementById("inst-kicker");
    var elBadge = document.getElementById("inst-badge");
    var elTitle = document.getElementById("inst-title");
    var elDetail = document.getElementById("inst-detail");
    var elKcal = document.getElementById("inst-kcal");
    var elSub = document.getElementById("inst-sub");
    var elBurnTag = document.getElementById("inst-burn-tag");
    var elArc = document.getElementById("inst-dial-arc");
    var macroVals = document.querySelectorAll("[data-macro-val]");
    var macroFills = document.querySelectorAll("[data-macro-fill]");
    var tabs = document.querySelectorAll(".inst-tab");

    var currentIndex = 0;
    var autoTimer = null;
    var userInteractedAt = 0;

    function applyState(index) {
      var item = TELEMETRY[index] || TELEMETRY[0];
      currentIndex = index;

      if (elKicker) elKicker.textContent = item.kicker;
      if (elBadge) elBadge.textContent = item.badge;
      if (elTitle) elTitle.textContent = item.title;
      if (elDetail) elDetail.textContent = item.detail;
      if (elKcal) elKcal.textContent = item.kcal;
      if (elSub) elSub.textContent = item.sub;
      if (elBurnTag) elBurnTag.textContent = item.burnTag;
      if (elArc) elArc.setAttribute("stroke-dashoffset", item.arcOffset);

      for (var i = 0; i < item.macros.length; i++) {
        if (macroVals[i]) macroVals[i].textContent = item.macros[i].val;
        if (macroFills[i]) macroFills[i].style.width = item.macros[i].pct;
      }

      Array.prototype.forEach.call(tabs, function (btn) {
        var isMatch = btn.getAttribute("data-tab") === item.tab;
        btn.classList.toggle("active", isMatch);
        btn.setAttribute("aria-pressed", String(isMatch));
      });

      Array.prototype.forEach.call(features, function (feat, idx) {
        feat.classList.toggle("is-active", idx === index);
      });
    }

    // Wire interactive tabs inside the phone mockup
    Array.prototype.forEach.call(tabs, function (btn) {
      btn.addEventListener("click", function () {
        userInteractedAt = Date.now();
        var key = btn.getAttribute("data-tab") || "burn";
        var targetIdx = TAB_TO_INDEX[key] !== undefined ? TAB_TO_INDEX[key] : 0;
        applyState(targetIdx);
      });
    });

    // Wire feature ledger hover/click
    Array.prototype.forEach.call(features, function (feat, idx) {
      feat.addEventListener("mouseenter", function () {
        userInteractedAt = Date.now();
        applyState(idx);
      });
      feat.addEventListener("click", function () {
        userInteractedAt = Date.now();
        applyState(idx);
      });
    });

    // Gentle auto-cycle when idle
    if (!reduceMotion) {
      autoTimer = window.setInterval(function () {
        if (document.hidden) return;
        if (Date.now() - userInteractedAt < 7000) return;
        var next = (currentIndex + 1) % TELEMETRY.length;
        applyState(next);
      }, 4200);
    }

    applyState(0);

    window.calibrEATDemo = {
      showFeature: applyState,
      stopAutoDemo: function () {
        if (autoTimer) clearInterval(autoTimer);
      }
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
