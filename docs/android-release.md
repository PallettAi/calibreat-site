# Building the Android APK

The runbook for turning this repo into an installable Android build:
**build → test on a device → publish → point the website at it.**

The APK is the app's only delivery channel (PLAN.md §2: sideload from the
website, no store). Until this runbook has run once, the download page has nothing
to install. Treat the release as the milestone it is.

`scripts/check-release.mjs` encodes most of what follows, so you can ask the repo
whether it is ready instead of re-reading this page:

```bash
node scripts/check-release.mjs            # config invariants (runs in CI)
```

## What is already true

- The licence service has been removed from the app and the repo. The app is free for now, so there is no activation server to run or configure.
- **Builds are arm64-only.** `expo-build-properties` sets
  `android.buildArchs: ["arm64-v8a"]` in `app.json`, replacing the SDK default
  of four ABIs. Shipping `armeabi-v7a` alongside it cost ~26 MB of duplicated
  native libraries — ML Kit's OCR pipeline, barcode, React Native and Hermes
  are all compiled per-ABI — and this is a sideload, so download size is a real
  cost to the person deciding whether to pay.
  **The trade:** a 32-bit-only device can no longer install the app. In
  practice that is pre-2016 hardware and some low-end 32-bit Android tablets;
  Expo's default `minSdkVersion` is 24, so such a device *would* otherwise have
  been eligible. Re-adding `"armeabi-v7a"` to that array restores it and costs
  the size back — do that deliberately, not by accident.
- **No APK exists yet.** `apps/web/download.html` says so honestly, and
  `check-release.mjs` prints the exact one-line edit that ships it.

## Part 1 — one-time setup

An Expo account (free — EAS builds are free on the tier we need).

```bash
cd apps/mobile
npx eas-cli@latest login          # opens a browser
npx eas-cli@latest init           # creates the EAS project, writes extra.eas.projectId
```

`eas init` edits `app.json` — commit that (`check-release.mjs` currently reminds
you it is missing).

EAS also generates and stores the Android **keystore** on the first build. Back it
up now, before you need it:

```bash
npm run credentials               # Android → Keystore → Download
```

The keystore *is* the app's identity. Lose it and no future APK can install over an
existing one: every user has to uninstall first, which deletes their logs. Keep the
downloaded file somewhere you control.

`.gitignore` files already refuse to track APKs, AABs, `.jks`, `.keystore` and the
other signing formats, and `check-release.mjs` asks **git** (so nested ignore files
count) whether each of those paths is ignored — a committed keystore is the one
mistake in this whole flow that cannot be undone.

## Part 2 — build & hotfix without redownloading

```bash
npm run build:dev      # development client APK — live sub-second Wi-Fi reload while testing
npm run build:apk      # preview APK — standalone release-like build (OTA channel: preview)
npm run release:apk    # production APK — the one you publish (OTA channel: production)
```

All three produce a signed **APK** (not an `.aab`; an `.aab` cannot be sideloaded)
with every native module (`@react-native-ml-kit/text-recognition`, `expo-camera`,
`expo-sqlite`, `expo-notifications`) compiled in.
First build takes 10–20 minutes on EAS's free queue; you get a download link, and
the same build appears in the [Expo dashboard](https://expo.dev). Download it — it
is gitignored on purpose, and `check-release.mjs` asserts it stays that way.

### Pushing hotfixes to an installed APK (no reinstall needed)

Because `expo-updates` is configured with `runtimeVersion: { "policy": "appVersion" }`,
you only need to download and install a new APK when **native code or `expo.version`
changes**. For any TypeScript, UI, copy, math, or logic change:

1. **OTA hotfix to `preview` or `production` APKs** (~20 seconds, works anywhere):
   ```bash
   cd apps/mobile
   npm run hotfix:preview -- --message "Fix layout / copy"
   # or for live customers on the production APK:
   npm run hotfix:production -- --message "Fix layout / copy"
   ```
   Force-close and reopen the app on the phone twice (once to download in the
   background, once to apply) — the updated bundle is live with all SQLite data
   and local data untouched.

2. **Instant live reload on the `development` APK** (sub-second over Wi-Fi):
   Install the `npm run build:dev` APK once, run `npx expo start --dev-client` on
   your Mac, and scan the QR code. Every save on your Mac hot-reloads on the phone
   instantly, with full native ML Kit OCR and camera support.

## Part 3 — test it on a device

Then, on the phone:

1. **Install** — transfer the `.apk`, tap it, allow installs from this source.
2. **Relaunch** — force-stop and reopen: straight to Home.
3. **Reminders** — Settings → Daily log nudge on. Set the time two minutes ahead and
   confirm it fires. Android 13+ asks for notification permission the first time; the
   permission comes from `expo-notifications`' own manifest, so there is no `app.json`
   entry to add.
4. **Barcode** — scan a packet (needs network; Open Food Facts). A miss should fall
   back to CoFID search rather than dead-ending.
5. **Offline** — airplane mode: log a meal, water, a weigh-in and a session, force-stop,
   relaunch. Everything persists; nothing blocks on the network.

Reminder scheduling is covered by `npm run check:reminders`, which tests the policy without a phone. This list is for
the things only a device can show you.

## Inspecting a built APK (do this before you install or publish)

`scripts/read-apk-manifest.py` reads the compiled binary manifest, so you can check
what a real build actually declares instead of trusting the config:

```bash
unzip -p calibrEAT-preview.apk AndroidManifest.xml > /tmp/AndroidManifest.xml
python3 scripts/read-apk-manifest.py /tmp/AndroidManifest.xml
```

It prints the identity block (`package`, `versionCode`, `versionName`, `minSdk`,
`targetSdk`) and the permissions the APK **actually requests** — a raw string search
of the manifest gives false positives, because strings can sit in the pool
unreferenced.

Worth confirming before publishing: `debuggable` should be **absent** (a release
variant), and no `DevSettingsActivity` or dev-menu component should appear.

**Permissions to expect:** `INTERNET`, `ACCESS_NETWORK_STATE`, `CAMERA`,
`POST_NOTIFICATIONS`, `VIBRATE`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, and the three Health Connect reads
(`android.permission.health.READ_ACTIVE_CALORIES_BURNED`, `READ_EXERCISE`, `READ_STEPS`) that `app.json` now declares. Anything else
is inherited from a library and lands on the user's install screen,which matters more
   than usual for a sideloaded app — trim the unused ones with
`android.blockedPermissions` in `app.json`.

## Part 4 — publish

1. **Bump the version** in `apps/mobile/app.json`: `expo.version` *and*
   `expo.android.versionCode`. `versionCode` must strictly increase or Android refuses
   to install the new APK over the old one. `check-release.mjs` enforces that
   `version` agrees with `package.json` and that `versionCode` is a positive integer;
   keep `package.json` in step.
2. **Build**: `npm run release:apk`.
3. **Host the APK** as a GitHub *Release asset* (recommended over Pages — it keeps a
   ~30 MB binary out of the repo and the deployed site, and gives a stable URL):
   tag `v0.0.3`, asset `calibrEAT-0.0.3.apk`,
   → `https://github.com/PallettAi/calibreat-site/releases/download/v0.0.3/calibrEAT-0.0.3.apk`
4. **Point the site at it** — one constant in `apps/web/download.html`:

   ```js
   const APK_URL = "https://github.com/PallettAi/calibreat-site/releases/download/v0.0.3/calibrEAT-0.0.3.apk";
   ```

   That page has two states and picks between them from this one constant: the button,
   the "In progress"/"Available" chip, the meta line, the hero CTA **and every line of
   status copy on the page** switch together, so a live download can never sit under a
   heading that still says "isn't ready to download yet". That covers everything
   *on* the page. The three `<head>` tags do not — JS cannot rewrite a meta tag, so
   they are step 5's business.
5. **Update the copy that lives elsewhere** — shorter now, but this is the step that gets
   forgotten, and stale "in progress" text is exactly the honesty problem this project
   keeps fixing:
   - `apps/web/download.html`: the `<head>` `description`, `og:description` and
     `twitter:description` (lines 7, 12, 22). Listed first because step 4 has just
     told you this file is handled — it isn't. JS cannot rewrite a meta tag, so all
     three keep saying "the APK is a build in progress" and ship that to search
     results and to every social share card the link is ever pasted into. Drop the
     clause, keep the sentence; the three must stay identical to each other.
   - `apps/web/index.html`: the FAQ answer (both the visible copy *and* the matching
     `FAQPage` JSON-LD answer near the top of the file — they must stay identical).
   - `apps/web/privacy.html`: "Android (APK sideload; build in progress)".
   - `PLAN.md`: M0's APK checkbox and M4's "free APK download hosting".
6. **Verify, then deploy**:

   ```bash
   node scripts/check-site.mjs
   node scripts/check-release.mjs --online
   ```

   `check-release.mjs` will now require `APK_URL` to be https, end in `.apk`, and
   contain the app version — so the hosted file and the build cannot silently diverge.
   Deploying is automatic once `apps/web` lands on `main` — `deploy-site.yml` publishes
   to the live host (GitHub Pages). A move to Cloudflare Pages was measured and parked;
   see `docs/site-hosting.md`.

## Part 5 — when something goes wrong

| Symptom | Cause / fix |
| --- | --- |
| Build: "Run `eas init` first" | One-time `npx eas-cli@latest init` (Part 1). |
| Build fails on `./assets/expo.icon` | iOS-only field. Android is unaffected; fix it before the first iOS build. |
| Silent notifications on Android 13+ | The permission prompt was dismissed. Re-enable in system settings; `check-reminders` covers the scheduling maths, not the OS prompt. |
| "App not installed" when installing over an older build | Different signing key (different Expo account/keystore) or a `versionCode` that did not increase. Bump `versionCode`; reinstall only as a last resort — uninstalling deletes the user's logs. |

## Test cluster device checklist (Health Connect, Train v2, week bank, widgets)

These need the EAS dev-client or preview APK. Expo Go cannot run Health Connect or the widgets.

1. Settings → Health Connect on, grant the three read permissions. Walk, then check the Home dial shows the source label, and a surplus line only when the walk beats your usual activity.
2. Log a Train session with Health Connect still on but no new active calories. The dial should fall back to the Train estimate.
3. Turn Health Connect off. The Train estimate applies without reinstalling.
4. Train: pick a lift, log one set, and check the rest timer. Repeat last set fills the weight and reps. A heavier set at the same reps shows a PR note. Save today's lifts as a routine, then start it from its chip on the next visit.
5. Eat under budget Monday and Tuesday. On Wednesday the remaining figure rises, but never more than 400 kcal above the base target.
6. Add the small and medium widgets. Their numbers match Home after a meal is logged (the widget refreshes when the app next updates it).
7. The app opens straight onto Home, with no sign-in or setup gate.

Known gaps for this cluster: routines are stored on the device and are not in the backup file yet (export v2 is deferred). Health Connect activity is cached per day on the device, not uploaded. Widgets refresh when the app writes a new snapshot, not on a timer.

## Not covered yet

- **iOS** — parked until an Apple Developer account exists (PLAN.md M2/M5).
- **Play Store** — not planned yet; the current plan is sideload-only (PLAN.md §2).
- **Hardening** — code obfuscation and runtime APK-signature checks are M5. The app is
  free and has no server-side gate to protect.
