# calibrEAT — Product & Engineering Plan

A calorie-tracking app for **Android (APK sideload first)** and **iOS (later)** that helps anyone
*calibrate their eating lifestyle*: log food, scan barcodes, track water and weight, and adapt
goals as you progress.

**Monetization:** the app itself is free to download, with **no in-app purchases and no ads**.
It is gated behind a **one-time lifetime activation code** sold on the calibrEAT website. The
buyer pays on the website and the code is delivered **instantly by email**.

---

## 1. Product vision

> *Free to install. One lifetime unlock. Your data stays on your phone.*

The app does not sell subscriptions, premium tiers, or consumables inside the store. A single
purchase unlocks the whole product forever. This keeps the product simple to explain and
simple to build: one app binary, one gate, one license.

### Scope for "anyone calibrating their eating lifestyle"

| Area | What it includes |
| --- | --- |
| Food logging | Meals (breakfast / lunch / dinner / snacks), quick-add by calories, recent items, edit & delete |
| Food search | Search a free food database (Open Food Facts / USDA FoodData Central), **barcode scanning** |
| Goals | Target calories & macro split; TDEE/BMR estimate from profile; recalculates as weight changes |
| Hydration | Daily water log with goal |
| Weight | Weigh-ins with trend |
| Insights | Daily/weekly summaries, charts of calories & macros vs. goal, streaks |
| Data | **Offline-first** local database; CSV/JSON export; no account required |
| Licensing | Welcome/lock screen → enter lifetime activation code → unlock (server-validated, cached offline) |

Non-goals for v1: social features, cloud sync, recipe databases, meal plans, professional
medical advice. Health data stays on-device; the only network call is license activation.

---

## 2. Distribution strategy (drives everything)

**Decision: Android APK sideload now. iOS via the App Store later.**

- No Apple Developer account yet → iOS is parked; the codebase is cross-platform (React
  Native + Expo), so iOS is a config + signing exercise when the account exists.
- **Important constraint (do not skip):** selling unlock codes *outside* in-app purchase
  conflicts with Apple App Store review (Guideline 3.1.1) and Google Play's billing policy.
  External activation codes are clean for **sideloaded APKs** (and other Android stores that
  allow it). If calibrEAT is later published to Google Play, the unlock must move to Google
  Play billing *or* remain sideload-only. **Recommendation:** treat the store as optional
  growth; the primary channel is the website (free APK download + paid activation code).
  Never put the "unlock" flow inside a store app.

### "Can't be bypassed" — honest security model

No client-side lock is unbreakable; anyone with the APK can decompile it. calibrEAT makes
bypassing *pointless for normal users* and *detectable when it matters*:

1. **The activation code only works if the server says so.** The app sends `{ code, installId }`
   to the activation API and stores only a server-validated license.
2. **The app fails closed in release builds.** If the API is unreachable at activation time,
   the user sees an error — no offline "guess the code" path.
3. **The license is cached after activation** so daily use is fully offline; validation happens
   on activation and periodically thereafter (see §7 hardening).
4. **Anti-tamper (optional, later):** verify the APK signature and bundle ID at runtime;
   re-validate licenses on an interval and refuse to run if the stored license is inconsistent.

---

## 3. Architecture

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│  calibrEAT mobile app        │  HTTPS  │  calibrEAT website (later)   │
│  (React Native + Expo)       │◄───────►│  marketing + sales landing    │
│  - Welcome/lock screen       │         │  - free APK download         │
│  - Activation (enter code)   │         │  - "Get lifetime license" →  │
│  - Logging UI (future)       │         │    hosted checkout           │
│  - Local SQLite (future)     │         └──────────────┬───────────────┘
│  - AsyncStorage license      │                        │ purchase webhook /
│  cache (validated)           │                        │ license API
└──────────────┬──────────────┘                        ▼
               │ POST /v1/activate (code + installId)  ┌──────────────────────┐
               │ GET  /v1/licenses/:code (re-validate) │ License + payments   │
               └───────────────────────────────────────►│ layer (M3)           │
                                                         │ - Merchant of Record│
                                                         │ - license records + │
                                                         │   activation counts │
                                                         │ - email delivery    │
                                                         └──────────────────────┘
```

**Why a Merchant of Record (MoR) instead of rolling our own payments:** MoR handles checkout,
credit cards, **global sales tax**, chargebacks, and — critically — **email delivery of the
purchase receipt with the activation code**. Building Stripe + a mailer + tax handling
yourself is a second product. MoR candidates researched (state as of 2026):

| Platform | Fee (approx.) | License features | Notes |
| --- | --- | --- | --- |
| **Paddle** | 5% + $0.50 | License key generation & verification API | Solid MoR; needs review of per-product licensing APIs |
| **Lemon Squeezy** | 5% + $0.50 | Per-purchase key + activation/validation/deactivation API; device variants | Acquired by Stripe; team now builds "Stripe Managed Payments" — confirm migration path before committing long-term |
| **Dodo Payments** | 4% + $0.40 | Per-purchase keys, public activate/validate endpoints, email delivery | Newer; strong licensing fit and cheapest |
| **Gumroad** | 10% + $0.50 | Key generation + verification API only (no device management) | Simplest, but weak licensing controls for the price |
| **Freemius** | from 4.7% | Full lifecycle licensing + activations | Strong fit if mobile licensing SDKs are needed |

**Recommendation:** start with **Lemon Squeezy or Dodo Payments**; decide by testing their
activation API against the app contract below. The app never talks to the payment platform
directly — it talks to `LICENSE_API_URL`, so swapping providers later is cheap.

### App ↔ server contract (already implemented client-side)

The lock screen is a three-step gate: **email → OTP → license code**. The signup email is
verified first and persisted on-device; activation then binds the license code to it
(1 active device per account). Endpoints:

`POST {licenseApiUrl}/v1/request-verification` with JSON `{ "email": "…" }` — emails a 6-digit code.

`POST {licenseApiUrl}/v1/verify-email` with JSON `{ "email": "…", "otp": "…" }` — validates the code.

`POST {licenseApiUrl}/v1/activate` with JSON `{ "code": "…", "email": "…", "installId": "…" }`.

Expected activation response (HTTP 200):
```json
{ "valid": true, "activatedAt": "…", "plan": "lifetime", "customerEmail": "…" }
```

Error responses return a non-200 (or `"valid": false`) with a `"message"` the app displays.
Until M3, the app runs in **dev-activation mode** (any valid email + any 6-digit code verifies
locally, then any well-formed license code unlocks) — release builds *require* the real
endpoints and fail closed otherwise.

---

## 4. Licensing model

- **One lifetime code per purchase**, delivered instantly by email (receipt + "My orders"
  page in the MoR storefront as backup).
- A code is bound to **1 active device per account** (the verified signup email). A second
  `installId` is rejected until "Deactivate on this device" frees the slot, the owner uses
  “I don’t have that device” (OTP-gated `/v1/release`), or support clears it
  (`POST /v1/admin/clear-activation`). Activations store an optional device label (e.g. Pixel 8).
- If a user replaces their phone, they deactivate on the old device then reactivate with
  the same code and email. If the old device is gone, they verify email on the new one and
  tap “I don’t have that device”, or contact support to reset the slot.
- **Refunds/chargebacks:** MoR webhook tells us to revoke; the app re-validates periodically
  and locks again if a license is revoked (see hardening in §7).

---

## 5. Data model (local-first, future milestone)

All user data lives in a local SQLite DB (`expo-sqlite`). No account, no server storage of logs.

```
profile      id, sex, birth_date, height_cm, activity_level, created_at
goals        id, calorie_target, protein_g, carbs_g, fat_g, start_weight_kg
food_items   id, name, brand, serving (g/ml), kcal, protein, carbs, fat
log_entries  id, meal, food_item_id?, name_snapshot, qty, kcal/macros snapshot,
             logged_at, day_key (YYYY-MM-DD)
water        id, day_key, ml, logged_at
weigh_ins    id, kg, measured_at
license      (AsyncStorage) code, activatedAt, plan, customerEmail
```

Derived views: daily totals per `day_key`, rolling 7/30-day averages for trends.

---

## 6. Screen map

| Screen | State | Purpose |
| --- | --- | --- |
| **Welcome / Lock** (`src/app/index.tsx`) | Not activated | Brand hero, feature bullets, and the three-step gate (email → 6-digit verification code → license code) with "Get a lifetime license" → website. No bypass: activated users are redirected to Home before this ever paints, and activation without a verified email fails even in dev. |
| **Home** (`src/app/home.tsx`) | Activated | Real dashboard: today's calorie goal, macro targets, water quick-add, weight summary; deactivate-this-device; first-run users are routed to `/setup`. |
| **Profile setup** (`src/app/setup.tsx`) | Activated, no profile | 7-step wizard: sex, age, height, weight, activity, goal + pace, computed targets (Mifflin-St Jeor); saves profile + goals to the local DB. |
| Food diary, Search/barcode, Water, Weight, Insights | Future | Milestone M1+ |

---

## 7. Roadmap

### M0 — Foundation ✅ (this repo, current state)
- [x] Expo (React Native) app scaffold, TypeScript, expo-router, dark/light theming
- [x] Welcome/lock screen with activation flow + "get a license" link to website
- [x] Home placeholder behind the lock with license summary + deactivate
- [x] License module: normalization, storage (AsyncStorage), dev-activation mode,
      release builds fail closed
- [x] Repo-level plan + READMEs
- [ ] Replace default Expo icon/splash with calibrEAT branding
- [ ] Build a debug **Android APK** (`npx expo run:android` / EAS) and smoke-test the gate

### M1 — Offline MVP (the real product)
- [x] Local data layer: SQLite (`expo-sqlite`) on native with an identical
      localStorage-backed implementation for the web preview (`db.ts` /
      `db.web.ts`); profile, goals and water tables
- [x] Profile & goals setup flow (`/setup`): sex → age → height → weight →
      activity → goal+pace → summary; computes BMR/TDEE (Mifflin-St Jeor),
      calorie target with deficit/surplus, P/C/F split, healthy-weight-range
      suggestion from height; prefilled when editing later. Units picker for
      height (cm / m / ft+in) and weight (kg / lb / st+lb) with convert-on-
      switch and saved preferences; a "Just monitor" goal option (no
      deficit/surplus, target = estimated burn)
- [x] Home dashboard (`/home`): calorie goal, macro bars, weight summary;
      water widget with ml/cups input (1 cup ≈ 240 ml, goal = 35 ml/kg);
      macros card opens the full nutrient screen; first-run users are routed
      to `/setup`
- [x] Macros screen (`/macros`): protein, carbs, fat, plus basic micronutrients
      (fibre, sugars, saturated fat, sodium) from Open Food Facts when the pack lists them.
- [ ] Food diary: add meal entries (quick-add calories + search later), day view with totals
- [ ] Water tracker and weight log with simple summary screen
- [ ] Export/import of data (JSON/CSV) for backups & device migration

### M2 — Food database & barcode (UK-first, all free)
- **UK CoFID** (McCance & Widdowson, the official UK government composition dataset,
  ~3,300 foods, free / Open Government Licence) — bundle as the offline nutrient reference
  for everyday foods and for the extended macros screen
- **Open Food Facts** (free, open API) — UK barcode scanning for packaged products, with
  offline cache; nutrients wherever the product label lists them
- **USDA FoodData Central** (free API) — fallback / cross-check for items neither covers
- Barcode scan via the camera (`expo-camera`) → product lookup → log
- Search UI with recent/favorites

### M3 — Licensing backend
- Pick MoR (Lemon Squeezy or Dodo Payments); configure **lifetime product** with instant
  **email delivery of the activation code**
- [x] License API implemented in `apps/api` (Cloudflare Worker + SQLite-backed
      Durable Object, free plan): email→OTP verification, activation binding
      code+email+installId, 1-device rule, `/v1/validate`, and the MoR webhook
      for purchases/refunds. Deploy with `npm run deploy` (see `apps/api/README.md`),
      then set `EXPO_PUBLIC_LICENSE_API_URL` in the release APK build.
- Wire `EXPO_PUBLIC_LICENSE_API_URL` into release APK builds; test purchase → email → activate
  end-to-end on a real device
- Replace the `Math.random()` install-id with a cryptographically random device id and send
  device model/OS for support

### M4 — Website
- [x] Landing page scaffolded in `apps/web` (brand design, purchase CTA, activation explainer,
      features, download, FAQ) — checkout/APK URLs are placeholders in the top CONFIG block
- Marketing/sales site polish: pricing, license redemption/help, provider checkout links wired in
- **free APK download** hosting + real domain
- Privacy policy & terms (MoR templates help); support email
- Optional: order-status / license-lookup helper page that calls the license API

### M5 — iOS & hardening (parked)
- Register Apple Developer account; set up iOS signing/icons; TestFlight beta
- **Decide store strategy first** (§2 — likely sideload-only, or revisit monetization)
- Optional hardening: APK signature verification, periodic online re-validation with
  lock-on-revocation, obfuscation review

---

## 8. Open decisions (need you)

1. **Price** of the lifetime license.
2. **Free tier before purchase?** e.g., 7-day full trial, or read-only demo, or hard lock.
   (The current gate is a hard lock with no trial.)
3. ~~Website domain~~ **Resolved:** everything consolidated on **`calibreat.co.uk`** —
   site (GitHub Pages, CNAME), app link constants, support address and OTP sender.
   (`calibreat.app` remains unused; grab it as a redirect later if desired.)
4. **Activation code format** (current UI implies blocks like `AB12-CD34-EF56`).
5. **MoR choice** in M3.
6. **Google Play path later:** sideload-only forever, or Play billing for a store edition?
7. **License self-service portal.** The in-app "Manage my license" menu item currently
   deep-links to the website's license page (`/license.html#faq`: lost-code FAQ + support
   email, overridable with `EXPO_PUBLIC_LICENSE_HELP_URL`). There is no customer portal yet.
   Options, cheapest first: (a) keep support-email handling; (b) M4's optional
   order-status/license-lookup helper page that calls the license API with email + code;
   (c) the MoR's built-in customer portal (e.g. Lemon Squeezy "My orders"), linked from the
   receipt and the in-app menu.
8. **Support inbox.** `support@calibreat.co.uk` (referenced by Terms/Refunds/Privacy and
   the in-app help link) is received via **Resend Inbound** and wired into the license
   Worker (`POST /v1/webhook/inbound` — Svix-verified, deduped, 90-day metadata store,
   optional auto-ack). Read mail in the Resend dashboard; no Cloudflare zone required —
   the only DNS change is one MX record at Fasthosts. Full setup, DNS records and GDPR
   retention notes: `docs/support-email.md`.

---

## 9. Running the app

```bash
cd apps/mobile
npm install
npm run web        # web preview (dev-activation mode)
npm run android    # Expo Go on a device/emulator (dev-activation mode)
```

Release APK builds require a real activation API (`EXPO_PUBLIC_LICENSE_API_URL`); until M3,
use dev builds/Expo Go which accept any well-formed code.

Repository layout:

```
PLAN.md
apps/
  mobile/    # Expo (React Native) app — welcome/lock gate, license flow
  # future:  web/ (marketing site), api/ (license service), shared/
```
