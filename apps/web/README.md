# calibrEAT website (`apps/web`)

Two static pages: a **landing page** (`index.html`) for the app itself, and a **License
Key page** (`license.html`) that sells the lifetime activation code. Plain HTML/CSS/JS on
purpose: zero build step, free to host anywhere, and the sale itself happens on a hosted
checkout page (Merchant of Record), so this site never touches payment data.

The full flow the site describes:

```
Download free APK  →  open app (welcome screen is locked)
                          ↑
"Get lifetime access" button (license.html)  →  hosted checkout (MoR)  →  instant
email with the permanent activation code  →  enter code in app  →  unlocked for life
```

## Making the store live (TODO)

Open `index.html` (and `license.html`, which shares the same `CONFIG` block) and update the
two constants at the top of `index.html`:

| Constant | What to set |
| --- | --- |
| `CHECKOUT_URL` | The hosted checkout link for the one-time "lifetime activation code" product |
| `APK_URL` | The URL where the signed Android APK is hosted for download |

`license.html` is generated from the same head/CSS as `index.html` — keep them in sync when
the styling changes (the shared `<style>` block lives in `index.html`; `license.html` is a
copy). Until both are set, the buttons point at `#...` placeholders, which is fine to
ship/design with.

The page is self-contained by design (all assets inline or data-URIs) so it survives on any
static host with zero setup. The only external dependency is a Google Fonts stylesheet
(Sora + Inter) — if it can't load, the page falls back gracefully to system fonts.

## Page structure (2026 redesign)

Dark `#0a1019` / green `#1F9D55` / lime `#B7E93C` brand, matching the app. The page
background is a single continuous color in each theme — no per-section banding:

- `index.html` — landing page:
  - Hero with headline + **CSS/SVG phone mockup** of the app's real lock screen
  - Features grid (hand-drawn stroke icons) · APK / iOS download cards
  - FAQ (app questions only) · 4-column footer
  - All purchase CTAs link to `license.html`
- `license.html` — License Key page:
  - Centered hero: "One payment. Your key. For life." + buy CTA
  - "How it works" steps · the one-time-payment commitment note
  - **Purchase card** (`€ — price set at store launch` until a price is decided)
  - License FAQ (payment, delivery, devices, lost email)

Subtle reveal-on-scroll is applied via `IntersectionObserver` and disabled for users who
prefer reduced motion. Every CTA with a real destination (`Get lifetime access`, Download
APK) is wired to `CHECKOUT_URL` / `APK_URL` — one `CONFIG` block at the top of `index.html`,
copied into `license.html`.

**Theme:** dark is the default; a sun/moon toggle in the nav switches the whole page to a
light theme. The choice is persisted in `localStorage` (`calibreat-theme`) and restored
before first paint to avoid a flash. All colors are CSS custom properties under `:root`
(dark) with a `[data-theme="light"]` override block, so the brand palette stays consistent
in both modes.

### Provider checklist (any Merchant of Record works)
The activation code is delivered **by email automatically at purchase**, so the provider must
support **automatic license-key delivery**. When evaluating (Lemon Squeezy · Dodo Payments ·
Paddle · Gumroad · Freemius — see `PLAN.md` §3):

1. Product = one-time purchase (no subscription) that auto-generates a **unique license key**
   per sale and emails it with the receipt.
2. Confirm the key is **permanent** (not tied to a subscription lifecycle).
3. Later (milestone M3): pick whichever offers a **license validation API** the app can call —
   the app already speaks the contract in `apps/mobile/src/lib/license.ts`
   (`POST /v1/activate` with `{ code, installId }`).
4. Grab their **hosted checkout link** for the product → that becomes `CHECKOUT_URL`.

## Files

```
index.html            landing page (design + copy; keep the CONFIG block at the top)
license.html          license / purchase page (shares the same head + styles as index.html)
assets/
  calibreat-mark-line.svg        primary monoline mark (light surfaces)
  calibreat-mark-line-dark.svg   night mark (dark surfaces, used in nav/hero/footer)
  calibreat-lockup.svg           full mark + wordmark lockup
```

The master brand assets live in `brand/` at the repo root — `apps/web/assets/` is a working
copy for the site.

## Hosting

Static site → any of: Cloudflare Pages, Netlify, GitHub Pages, or a plain `nginx`/Caddy vhost.
No server-side code. Custom domain (currently placeholder `calibreat.app` in
`apps/mobile/src/constants/app.ts` and here) should be decided before public launch.

## Future pages (not built yet)

- `/privacy` and `/terms` (footer links currently point at `#`)
- License lookup / "lost my code" helper page (calls the M3 license API)
- Real support email + FAQ expansion
