# Building the Android APK

The runbook for turning this repo into an installable, sellable Android build:
**build → test on a device → publish → point the website at it.**

The APK is the product's only delivery channel (PLAN.md §2: sideload from the
website, no store), and checkout is already live — so until this runbook has run
once, the site can take £4.99 for something nobody can install. Treat the release
as the milestone it is.

`scripts/check-release.mjs` encodes most of what follows, so you can ask the repo
whether it is ready instead of re-reading this page:

```bash
node scripts/check-release.mjs            # config invariants (runs in CI)
node scripts/check-release.mjs --online   # + a live probe of the licence API
```

## What is already true

- The licence API **is deployed and healthy** —
  `https://calibreat-license.coreypallett20.workers.dev` (`/health` → `{"ok":true}`).
  `apps/mobile/eas.json` pins that URL into both build profiles, and
  `check-release.mjs` asserts its host still matches `name` in `apps/api/wrangler.toml`.
- **Release builds fail closed.** Without `EXPO_PUBLIC_LICENSE_API_URL` baked in,
  activation returns "Activation is not configured on this build yet" — by design,
  so a mis-built APK can never be unlocked with a guessed code.
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

## Part 2 — build

```bash
npm run build:apk      # preview profile — use this while testing
npm run release:apk    # production profile — the one you publish
```

Both produce a signed **APK** (not an `.aab`; an `.aab` cannot be sideloaded).
First build takes 10–20 minutes on EAS's free queue; you get a download link, and
the same build appears in the [Expo dashboard](https://expo.dev). Download it — it
is gitignored on purpose, and `check-release.mjs` asserts it stays that way.

## Part 3 — test it on a device

Mint a real licence code for your own inbox (from `apps/api/README.md`):

```bash
curl -X POST https://calibreat-license.coreypallett20.workers.dev/v1/admin/licenses \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com"}'
```

Then, on the phone:

1. **Install** — transfer the `.apk`, tap it, allow installs from this source.
2. **Lock screen** — enter that email; the 6-digit code arrives by email
   (if not: spam folder, then Resend → Logs).
3. **Wrong code** — a bad OTP is rejected, and the 5-attempt cap still applies.
4. **Activate** with the minted code → Home.
5. **Relaunch** — force-stop and reopen: straight to Home, no flash of the lock.
6. **Reminders** — Settings → Daily log nudge on. Set the time two minutes ahead and
   confirm it fires. Android 13+ asks for notification permission the first time; the
   permission comes from `expo-notifications`' own manifest, so there is no `app.json`
   entry to add.
7. **Barcode** — scan a packet (needs network; Open Food Facts). A miss should fall
   back to CoFID search rather than dead-ending.
8. **Offline** — airplane mode: log a meal, water, a weigh-in and a session, force-stop,
   relaunch. Everything persists; nothing blocks on the network.
9. **Deactivate** — Home → deactivate → back to the lock screen → reactivate. This is
   the first time the real `/v1/deactivate` path runs on a device.
10. **Second device** — same code, different phone: expect the 409 "active elsewhere"
    conflict naming the first device, then `/v1/release` (or "I don't have that device")
    to free the slot.
11. **Refund** — post a refund-ish event to `/v1/webhook/mor` with `x-webhook-secret`,
    relaunch the app, and confirm it locks itself. The site promises refunds re-lock the
    app; this is the only way to prove it before a customer finds out.

Anything in the licence client is covered by `npm run check:license` and
`npm run check:reminders` — those test the policy without a phone. This list is for
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

For the app itself:

```bash
unzip -p calibrEAT-preview.apk assets/index.android.bundle | grep -ac coreypallett20
```

A non-zero count proves `EXPO_PUBLIC_LICENSE_API_URL` was baked in, so the build will
fail closed against the real server rather than silently running in dev mode. Also
worth confirming before publishing: `debuggable` should be **absent** (a release
variant), and no `DevSettingsActivity` or dev-menu component should appear.

**Permissions to expect:** `INTERNET`, `ACCESS_NETWORK_STATE`, `CAMERA`,
`POST_NOTIFICATIONS`, `VIBRATE`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`. Anything else
is inherited from a library and lands on the user's install screen, which matters more
than usual for a sideloaded paid app — trim the unused ones with
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
   heading that still says "isn't ready to download yet". Nothing else on
   `download.html` needs editing.
5. **Update the copy that lives elsewhere** — shorter now, but this is the step that gets
   forgotten, and stale "in progress" text is exactly the honesty problem this project
   keeps fixing:
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
   Deploying is automatic once `apps/web` lands on `main` — `deploy-cloudflare.yml`,
   with `deploy-site.yml` still serving as the fallback host until the DNS cutover in
   `docs/site-hosting.md`.

## Part 5 — when something goes wrong

| Symptom | Cause / fix |
| --- | --- |
| Build: "Run `eas init` first" | One-time `npx eas-cli@latest init` (Part 1). |
| Build fails on `./assets/expo.icon` | iOS-only field. Android is unaffected; fix it before the first iOS build. |
| App says "Activation is not configured on this build yet." | The API URL was not baked in. `EXPO_PUBLIC_*` values are **inlined at build time** from `eas.json` — editing `.env` does nothing to an APK that already exists. Check the profile, rebuild. |
| "Couldn't reach the activation server" on a good network | `curl {API}/health`. If the Worker is down, the app fails closed by design. |
| Silent notifications on Android 13+ | The permission prompt was dismissed. Re-enable in system settings; `check-reminders` covers the scheduling maths, not the OS prompt. |
| "App not installed" when installing over an older build | Different signing key (different Expo account/keystore) or a `versionCode` that did not increase. Bump `versionCode`; reinstall only as a last resort — uninstalling deletes the user's logs. |

## Not covered yet

- **iOS** — parked until an Apple Developer account exists (PLAN.md M2/M5).
- **Play Store** — external activation codes conflict with Play billing; the current
  plan is sideload-only (PLAN.md §2).
- **Hardening** — code obfuscation and runtime APK-signature checks are M5. The
  security model relies on the server being the gate, which is exactly how it is built.
