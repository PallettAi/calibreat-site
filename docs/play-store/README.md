# Google Play starter guide

calibrEAT is currently sideload-only (PLAN.md §2). This folder is the groundwork for a Play listing, which is an optional channel. Play's rules change often, so check each step in the Play Console Help pages before you act.

## Where to begin

1. **Decide whether Play is in scope.** PLAN.md §2 says the store is optional, and the website is the primary channel. Play's billing policy only matters if the paid unlock moves into the store app. The licence service has been removed (docs/android-release.md), so the app is free today and that isn't a blocker.
2. **Create a Google Play Console developer account** (one-time registration fee, about $25). Personal accounts need identity verification.
3. **Build an Android App Bundle (AAB), not an APK.** `apps/mobile/eas.json` builds APKs for every profile. Add a profile such as `"play": { "distribution": "store", "android": { "buildType": "app-bundle" } }`. Package name is `com.calibreat.app`; `versionCode` is currently 9 in `app.json`, so bump it for each upload.
4. **Enrol in Play App Signing** when you create the app. Keep the upload key backed up.
5. **Run a closed test.** Recent personal developer accounts have had to run a closed test with a minimum number of testers for a set number of days before production access. I have not verified the current numbers; confirm them in Play Console before planning around them.
6. **Complete the declarations**, then submit for review.

## Declarations the Console will ask for

- **Privacy policy URL.** Use the live `apps/web/privacy.html` page.
- **Data safety form.** Describe what is collected (food, weight, workouts, camera for barcodes) and what stays on-device.
- **Health apps / Health Connect declaration.** The app reads steps, exercise and active calories through Health Connect, so Play will ask about health data use.
- **Content rating questionnaire.**
- **Target audience and ads declaration** (no ads, as far as the repo shows).
- **Target API level.** Check with `scripts/read-apk-manifest.py` on a real build. New releases must target the current Android API, which moves each year.

## Store listing assets

| Asset | Size | File |
| --- | --- | --- |
| Phone screenshots (2–8) | 1080×1920 | `out/phone-1-home.png`, `out/phone-2-macros.png`, `out/phone-3-train.png`, `out/phone-4-trends.png` |
| Feature graphic | 1024×500 | `out/feature-graphic-1024x500.png` |
| App icon | 512×512 PNG | `out/icon-512.png` |

Draft copy (check it matches what the app actually does before you publish):

- **Short description (80 characters max):** Track calories, macros, water, workouts and weigh-ins in one place.
- **App name:** calibrEAT

## Rebuilding the graphics

The slides are HTML, so edits are easy to review:

```bash
python3 docs/play-store/render.py   # needs playwright + chromium
```

- `slides.html` holds the layout, headlines and screenshot references.
- `screens/` holds the captures the slides use. They came from the **web build** and most show empty states (no meals or weigh-ins logged yet). For the real listing, take screenshots on a device or emulator with sample data, then drop them into `screens/` with the same names.
- The icon slide reuses `apps/mobile/assets/images/icon.png`.

## Open decisions

- Whether Play is in scope at all (PLAN.md §2 says sideload-only for now; §8 lists open decisions).
- If Play is used, whether the paid unlock stays sideload-only or moves to Play Billing.
- Whether to replace the web-build screenshots with device captures before submission.
