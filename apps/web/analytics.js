// Cloudflare Web Analytics — the site's only measurement.
//
// Why this one: it is cookieless, truncates IP addresses, builds no personal
// profiles and sets nothing in localStorage, so under UK ICO guidance it needs
// no consent banner. It counts page views and referrers on the WEBSITE only —
// it never sees anything a visitor does inside the calibrEAT app, and the app
// itself ships no analytics at all.
//
// To go live (one manual step):
//   Cloudflare dashboard → Analytics & Logs → Web Analytics → Add a site
//   → copy the token → paste it over REPLACE_WITH_TOKEN below. Everything
//   else (script tags, CSP, privacy policy) is already wired.
//
// Until then this file is inert: with the placeholder in place nothing loads,
// nothing is sent, and the pages behave exactly as before.
(function () {
  var TOKEN = "REPLACE_WITH_TOKEN";
  if (!TOKEN || TOKEN === "REPLACE_WITH_TOKEN") return;
  var s = document.createElement("script");
  s.defer = true;
  s.src = "https://static.cloudflareinsights.com/beacon.min.js";
  s.setAttribute("data-cf-beacon", JSON.stringify({ token: TOKEN }));
  document.body.appendChild(s);
})();
