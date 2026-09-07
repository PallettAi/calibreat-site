# calibrEAT (mobile app)

Free-to-install calorie tracker for **Android (APK sideload)** first, iOS later. The app is
gated behind a **one-time lifetime activation code** sold on the calibrEAT website and emailed
to the buyer. No in-app purchases, no ads.

See [`PLAN.md`](../../PLAN.md) at the repo root for the full product & engineering plan.

## What's implemented (M0)

- **Welcome / lock screen** (`src/app/index.tsx`) — the whole app is locked behind license
  activation. Enter your code → validated → home unlocks. Activated users are redirected past
  this screen at startup (no flash of the lock, no bypass via navigation).
- **Home** (`src/app/home.tsx`) — post-activation screen with your license summary and the
  roadmap preview of upcoming modules (food diary, barcode, water, weight, insights).
- **License module** (`src/lib/license.ts`) — code normalization/validation, activation
  handshake, local persistence (AsyncStorage), per-install device id.
- **Gating** (`src/lib/license-context.tsx`, `src/app/_layout.tsx`) — a single source of truth
  for license state; splash stays up until the stored license is read.

## Activation modes

| Mode | When | Behavior |
| --- | --- | --- |
| Dev activation | `npm run web` / Expo Go, no `EXPO_PUBLIC_LICENSE_API_URL` | Any well-formed code (e.g. `AB12-CD34-EF56`) unlocks locally — for testing the flow only |
| Real activation | Release APK with `EXPO_PUBLIC_LICENSE_API_URL` set | Code is validated against the activation API; the app **fails closed** if the server is unreachable |

## Run it

```bash
npm install
npm run web       # browser preview (dev activation)
npm run android   # Expo Go on a connected device/emulator (dev activation)
```

Test the gate: open the app → lock screen shows → enter `AB12-CD34-EF56` (or any
letters/digits grouped like that) → home unlocks. Use **Deactivate on this device** on Home to
lock it again.

## Project layout

```
src/
  app/          # expo-router screens: _layout (gate), index (lock), home (unlocked)
  components/   # brand mark, themed primitives, external link
  constants/    # theme tokens, brand palette + URLs (src/constants/app.ts)
  hooks/        # color scheme / theme hooks
  lib/          # license.ts (logic), license-context.tsx (state provider)
```

## Config values to replace later

- Website / store URL — `src/constants/app.ts` (`AppMeta.websiteUrl`, default
  `https://calibreat.app`)
- Activation API URL — set `EXPO_PUBLIC_LICENSE_API_URL` for release builds (see PLAN.md M3)
- App icons / splash — `app.json` + `assets/images/` (still the Expo defaults)
