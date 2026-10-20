# Task plan: calibrEAT single-page landing redesign

## Goal
Replace the main marketing experience at `apps/web/index.html` with one clean, Apple-inspired scrollable page, no navigation bar, existing logo and brand colours, original distinctive artwork, and App Store / Google Play buttons clearly marked “Coming soon”. Keep secondary legal/support pages available through restrained footer links. Preserve unrelated in-progress repository changes.

## Phases
1. Inspect current homepage, uncommitted changes, brand assets, and available preview/test tooling. **Complete**
2. Establish acceptance checks for the single-page/store-button requirements before implementation. **Complete**
3. Implement the approved design in the homepage and a scoped stylesheet; preserve existing unrelated edits. **Complete** **Complete**
4. Run checks and verify the rendered desktop/mobile experience in the browser. **Complete**

## Decisions
- Use the existing checkout-free App Store and Google Play buttons as disabled/coming-soon controls until real listing URLs exist.
- Keep legal and support pages available via small footer links.
- Work in the current checkout by user choice; do not disturb unrelated dirty files.
- Use bespoke inline vector artwork because no image-generation tool is available in this workspace.

## Errors encountered
| Error | Attempt | Resolution |
|---|---|---|
| `rg` unavailable in the host shell | Initial repository searches | Use `grep`, Python, and project file tools instead. |
| Node.js unavailable | Runtime/tool discovery | Use Python checks and browser preview tools where possible. |
| Python Playwright unavailable | Browser test discovery | Use the built-in browser panel to exercise the static served page. |

## Verification
- `python3 apps/web/scripts/check-landing.py`: 24 acceptance checks pass.
- `python3 -m py_compile apps/web/scripts/check-landing.py`: passes.
- `git diff --check -- apps/web/index.html`: passes.
- Project static server responses for `/`, `/landing.css`, `/site.js`, and `/favicon.svg`: HTTP 200 with expected content types.
- Browser preview inspected at 1440px desktop and 390px mobile; rendered page has no horizontal overflow, no nav/header, one main, original artwork, and disabled clearly marked store buttons. Console/network log showed no errors and all local requests succeeded.
- App-store links remain inactive until real listing URLs are provided.
- Full existing site/mobile/API suite not run; Node is not installed in the host environment.

## Next step
None. Work is complete; dev server remains running for user review at `http://127.0.0.1:4181/`.
