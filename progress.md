# Progress log

## 2026-10-18
- Read brainstorming, planning-with-files, worktree, TDD, frontend-design, and verification skills.
- User approved a no-nav, single-scroll landing-page redesign and selected store buttons marked Coming soon.
- User approved retaining legal/support pages as discrete footer links and asked to work in the current checkout.
- Inspected target; it is already dirty with independent local edits (script tag in index, substantial polish stylesheet changes). Plan to keep these untouched where possible, isolate new homepage styling in `apps/web/landing.css`.
- Discovered Node, ripgrep, and Python Playwright are not installed. Project-provided Python static server and built-in preview/browser tools can provide behavior verification.
- Replaced the sales-oriented home page with a four-section responsive landing page, using a custom inline apple/telemetry illustration and an in-app day diary mock screen. No top nav/header; platform actions are disabled, labeled App Store/Google Play + Coming soon; retained legal/support links in the compact footer. Preserved the existing `site.js`, analytics, and `script.js` includes; style isolated in `apps/web/landing.css`.
- Added `apps/web/scripts/check-landing.py` acceptance checks; initial run failed expected old-nav/checkout requirements before implementation; final run passes 24 assertions.
- Started official static server as a persistent process and registered browser preview at http://127.0.0.1:4181/.
- Verified 1440x900 desktop and 390x844 mobile rendering; no horizontal overflow at either size, no nav/header, buttons disabled/marked coming soon, logo loads. Reviewed console and network logs: no console errors and all page/style/script/logo requests succeeded.
- Final direct checks: local links/assets resolve; Python test script compiles; site files return HTTP 200 with expected content types; `git diff --check -- apps/web/index.html` passes.
- No Node runtime available, so full Node-based project suites were not run. No current app-store listing URLs exist; buttons remain disabled intentionally until provided.
