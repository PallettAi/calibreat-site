# Train muscle view — design

Date: 2026-09-11

## Job

A **Train** area, separate from food Home. Open a lift and see which muscles it uses on a Hevy-like athletic body, enter sets × reps, and see an **estimated extra kcal** for that session. Compare table stays No until this ships in an APK.

## Navigation

After unlock: **Eat | Train** switch.

- Eat → `/home` (existing diary, water, True Burn). No workout widgets.
- Train → `/train`. No food widgets (no water, streak, macros).
- Same license gate (`Stack.Protected`). Profile setup is not required to open Train; kcal estimates need a profile.

## Figure

Hevy visual language, MIT `react-native-body-highlighter` male SVG (recolored — not Hevy’s files):

- Front and back **side by side** (no flip). Static standing figure — lights muscles only, no movement loop.
- Resting muscle: cool gray.
- Primary: bright lime `#B7E93C`.
- Assisting: dimmer lime/green.
- Male body for this slice. Female later.
- Selecting a lift lights those muscles. Highlights stay on.
- Train opens on the lift list. The figure is hidden until a lift is picked.

## First lifts

Two tabs: **Free** (free weights + bodyweight) and **Machines**. Same male front/back figure for both — no machine drawings. Gym order inside a tab: Chest, Back, Shoulders, Biceps, Triceps, Abs, Quads, Glutes, Hamstrings, Calves. An exercise with two primaries appears in both groups.

Tabs filter the picker only. A lift already picked stays on screen if you switch tabs. Muscle map, lists, and sets × reps appear **after** a pick.

Plank uses sets × reps where one rep is a ~20s hold.

Full catalogue and MET table live in `muscles.ts` / `workout.ts` (Compendium MET; machines 3.5, free compounds 6, calisthenics 8, plank 4).

## Demonstrate + log (local only)

- **Figure:** static front + back muscle map (no how-to text, no video, no movement loop).
- **Sets × reps** only (no load field this slice). Clamped 0–30 sets, 0–100 reps.
- **Add to tracker** stores the session on-device and **adds the estimated kcal to Eat remaining** for that day (`remaining = target + Train kcal − food`). Remove a session to take it back off. True Burn stays food + weigh-ins (workout estimates do not move measured TDEE).
- On-device only (SQLite / web localStorage), never sent to servers — same as food logs.
- Missing profile → no fake kcal; prompt to finish setup.
- Label as an estimate.

Math: personalized rest rate × Compendium MET × duration.

`kcal = round(BMR × MET × duration_sec / 86400)`

BMR = Mifflin-St Jeor (`bmr()` in `nutrition.ts`). Weight = latest weigh-in else setup weight (`resolveBmiWeight`). Duration = `sets × reps × secPerRep + (sets-1) × restSec`.

Timing constants are in `WORKOUT_EFFORT` (`workout.ts`). Machines use MET 3.5; free compounds 6; calisthenics 8; plank 4 with 20s per rep.

## Out of scope

Load / kg field, 3D orbit, female figure, CoFID, compare-table Yes, cardio machines, feeding Train kcal into True Burn.
