# Android test cluster Implementation Plan

> **For agentic workers:** Implement against `docs/superpowers/specs/2026-10-18-android-test-cluster-design.md`. TDD for kernel modules via `scripts/check-*.mjs`. Do not commit unless the user asks.

**Goal:** Ship Health Connect, Train v2, the Monday–Sunday calorie bank, and Android widgets on one calorie kernel, then produce a sideload APK.

**Architecture:** Pure JS kernel (`activity-burn`, `week-bank`, `day-budget`) is the only remaining-calorie math. Android adapters for Health Connect and widgets; web no-ops. Train keeps `workout_sessions` rows (one row can be one set) plus a local routines store so export/restore v1 stays valid.

**Tech Stack:** Expo SDK 57, SQLite, `react-native-health-connect`, `react-native-android-widget`, existing check scripts.

**Spec:** `docs/superpowers/specs/2026-10-18-android-test-cluster-design.md`

## Global Constraints

- Surplus-only eat-back; ±400 bank clamp then leftover cap; 75 kcal / 5 min real-activity floor
- No Health Connect writes; no IAP; logs on-device
- Widgets and Health Connect need a dev-client / EAS APK, not Expo Go
- Keep `calibreat.export.v1` readable; do not break restore drift guards

## Files

- Create: `apps/mobile/src/lib/activity-burn.ts`, `week-bank.ts`, `day-budget.ts`, `routines.ts`, `routines-store.ts`, `health-connect.ts`, `health-connect.web.ts`, `activity-cache.ts`, `widget-snapshot.ts`, widget handler
- Modify: `home.tsx`, `settings.tsx`, `train.tsx`, `settings.ts`, `app.json`, `package.json`, `_layout.tsx`, `docs/android-release.md`

## Order

1. Kernel + tests
2. Home + settings copy
3. Train v2
4. Health Connect
5. Widgets
6. `npm run check` then preview APK
