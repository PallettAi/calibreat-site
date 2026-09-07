# calibrEAT

Calibrate your eating lifestyle. A free, cross-platform calorie tracker with a
one-time lifetime unlock — no subscriptions, no in-app purchases, no ads.

## Repository layout

| Path | What it is |
| --- | --- |
| `apps/mobile/` | The app — Expo SDK 57 (React Native) + TypeScript + expo-router. Includes the welcome/lock screen, license activation flow and offline-persisted license state. |
| `apps/web/` | The marketing / sales landing page (static, single HTML file) with the lifetime-license purchase flow. |
| `brand/` | Brand system — monoline balance mark, wordmark lockup, gallery. |
| `PLAN.md` | Product & engineering plan: monetization model, licensing security analysis, data model, milestones. |

## Status

Pre-launch foundation (M0). The app skeleton with the license gate is runnable;
the checkout provider, activation server and food database integrations are not
wired yet — see `PLAN.md` and the `README.md` files inside each app for the
current TODOs.