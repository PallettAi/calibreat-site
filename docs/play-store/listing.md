# Google Play listing copy

Copy for Play Console → Grow → Store presence → Main store listing. Check each
claim against the shipped app before you publish.

## App details

- **App name (30 characters max):** calibrEAT
- **Package name:** com.calibreat.app
- **Default language:** English (United Kingdom)
- **Category:** Health & Fitness
- **Tags (optional):** Calorie counter, Diet, Nutrition
- **Contact email:** support@calibreat.co.uk
- **Website:** https://calibreat.co.uk
- **Privacy policy:** https://calibreat.co.uk/privacy.html

## Short description (80 characters max)

Track calories, macros, water, workouts and weigh-ins in one place.

(68 characters)

## Full description (4,000 characters max)

calibrEAT helps you eat to your goal without guesswork. Log what you eat, see
where your calories and macros stand, and check your progress against your
real weigh-ins.

Eat
- Search a UK food database built from CoFID, the official UK composition
  tables, or scan a barcode to look up packaged food.
- See protein, carbs, fat, vitamins and minerals against your daily targets
  as you log.
- Save meals you eat often and reuse them in one tap.
- Track water and fasting windows.

Train
- Build routines and log sets, reps and weights.
- See which muscles each exercise works on a muscle diagram.
- Add an estimated calorie burn for a session to your day.

Trends and True Burn
- Log weigh-ins and see your trend over time.
- True Burn works out how much you really burn from your food log and
  weigh-ins, so your target only changes when you choose.
- Share a daily summary card or a progress card.

Your data stays on your phone
- Your food, weight and workout logs are stored on your device. calibrEAT does
  not sell your data and does not show ads.
- Health Connect data (steps, exercise and active calories) is read on the
  device and is not uploaded.
- Export or back up your data at any time from Settings.

Languages
- Use calibrEAT in English, Spanish, French, German, Italian, Portuguese,
  Polish, Bengali, Hindi, Punjabi and Urdu. Change the language in Settings.
  Food names are translated where a translation is available; other food
  names stay in English.

calibrEAT is a tracker, not a medical device. It does not give medical advice.
Talk to a doctor or dietitian before you make big changes to your diet or
exercise, especially if you are pregnant, have a medical condition or take
medication.

## Graphics

| Asset | Size | File |
| --- | --- | --- |
| Phone screenshots (2–8) | 1080×1920 | `out/phone-1-home.png`, `out/phone-2-macros.png`, `out/phone-3-train.png`, `out/phone-4-trends.png` |
| Feature graphic | 1024×500 | `out/feature-graphic-1024x500.png` |
| High-res icon | 512×512 PNG | `out/icon-512.png` |

The phone screenshots came from the web build and most show empty states. Replace
them with device captures that show sample data before you submit.

## Release checklist

1. Create the Play Console developer account and verify identity.
2. Create the app with the name, package and default language above.
3. Build the bundle: `cd apps/mobile && npx eas-cli@latest build --platform android --profile play`.
   The `play` profile builds an Android App Bundle (`.aab`). Upload the `.aab`
   to the Internal testing track first.
4. Enrol in Play App Signing and back up the upload key.
5. Bump `expo.android.versionCode` in `apps/mobile/app.json` for each upload.
   It is 9 today.
6. Complete the Data safety form (food, weight, workouts, camera for barcodes,
   Health Connect; all stored on device).
7. Complete the Health apps declaration, the content rating questionnaire,
   the target audience and the ads declaration (no ads).
8. Run `python3 scripts/read-apk-manifest.py` on the built app to confirm the
   permissions and target API level.
9. Run the closed test. Confirm the current testers and days requirement in
   Play Console before you plan the production date.
10. Submit for review.
