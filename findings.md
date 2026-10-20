# Findings: calibrEAT landing redesign

- The active public homepage is `apps/web/index.html`; it is a 628-line page with a full nav, payment/activation content, feature catalogue, comparison table, legacy pricing/checkout section, FAQ, and multi-column footer.
- The target homepage is already dirty before this task: it includes an appended `<script src="script.js" defer>` not present at HEAD. Preserve it unless verified to be obsolete; do not overwrite other in-progress homepage edits.
- `apps/web/polish.css` also has pre-existing local modifications (grain, store badges, animated SVG phone, interactive dashboard styles). Preserve the file; new homepage design styles should be isolated in a newly linked `landing.css` to avoid disrupting other pages and avoid adding further to an already dirty shared stylesheet.
- Existing CSS in `apps/web/site.css` defines palette tokens: ink `#0B0F0C`, greens `#12B76A` / `#1FD37E` / forest `#0B3B26`, lime legacy brand `#B7E93C`, text `#EEF3EE`, secondary `#A9B6AC`. Existing brand images include `brand/calibreat-lockup.svg`, `brand/calibreat-mark-inverted.svg`, and `apps/web/favicon.svg`; site JS injects an inline brand mark to `img[data-mark]`.
- No App Store or Play Store listing URLs were found. User selected Coming soon buttons.
- Legal/support pages should remain reachable at the bottom, as approved.
- `apps/web/serve.py` serves the static website on 127.0.0.1 with project's actual `_headers` rules. Node and Python Playwright are unavailable; built-in browser tools are available.
- The host shell does not have ripgrep (`rg`) or Node (`node`). Python 3.9.6 is present.
- Existing repository has many unrelated staged/unstaged changes and untracked artifacts. Avoid cleanup or broad git operations.
