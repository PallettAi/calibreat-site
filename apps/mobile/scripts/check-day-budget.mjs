/**
 * DayBudget composition and Home copy (run: npm run check:budget).
 *
 * This is the only remaining-calorie math. Home, macros, trends and the
 * widget read it, so these cases pin the numbers those screens show.
 */
import { DAY_TARGET_MAX_KCAL, activityCopy, computeDayBudget, weekCopy } from '../src/lib/day-budget.ts';

let fails = 0;
const eq = (label, got, want) => {
  const ok = Object.is(got, want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

const TODAY = '2026-10-21'; // Wednesday, 5 days left
const noActivity = { connected: false, hcActiveKcal: 0, hcExerciseCount: 0, trainMetKcal: 0 };
const goals = { tdee: 2400, bmr: 1700 }; // assumed activity 700

const budget = (over = {}) =>
  computeDayBudget({
    todayKey: TODAY,
    baseTarget: 2000,
    goals,
    foodByDay: {},
    activity: noActivity,
    ...over,
  });

// No activity, no food: Wednesday with an empty week → 14000 / 5 clamped to base + 400.
const plain = budget();
eq('plain day: todayTarget is the clamped bank', plain.todayTarget, 2400);
eq('plain day: remaining is full target', plain.remaining, 2400);
eq('plain day: no surplus', plain.surplus, 0);
eq('plain day: burn source none', plain.burnSource, 'none');
eq('plain day: no source label', plain.sourceLabel, '');

// Food today reduces remaining one-for-one.
eq('food today reduces remaining', budget({ foodByDay: { [TODAY]: 650 } }).remaining, 1750);

// Train estimate below assumed activity: no surplus, source shown.
const trainBelow = budget({ activity: { ...noActivity, connected: false, trainMetKcal: 300 } });
eq('Train below assumed: surplus 0', trainBelow.surplus, 0);
eq('Train below assumed: source is train', trainBelow.burnSource, 'train');
eq('Train below assumed: label', trainBelow.sourceLabel, 'Train estimate');
eq('Train below assumed: target unchanged', trainBelow.todayTarget, 2400);

// Health Connect above assumed activity: surplus added on top of bank.
const hcBig = budget({ activity: { connected: true, hcActiveKcal: 820, hcExerciseCount: 1, trainMetKcal: 0 } });
eq('HC above assumed: surplus 120', hcBig.surplus, 120);
eq('HC above assumed: target = bank + surplus', hcBig.todayTarget, 2520);
eq('HC above assumed: label', hcBig.sourceLabel, 'Health Connect');

// Surplus is capped at 400 by activity-burn, so the target never exceeds bank + 400.
const hcHuge = budget({ activity: { connected: true, hcActiveKcal: 3000, hcExerciseCount: 2, trainMetKcal: 0 } });
eq('huge HC activity: surplus capped at 400', hcHuge.surplus, 400);
eq('huge HC activity: target = bank + 400', hcHuge.todayTarget, 2800);

// Missing goals: no eat-back even with measured activity.
const noGoals = budget({ goals: null, activity: { connected: true, hcActiveKcal: 900, hcExerciseCount: 1, trainMetKcal: 0 } });
eq('no goals: surplus is 0', noGoals.surplus, 0);
eq('no goals: source still reported', noGoals.burnSource, 'health-connect');

// Over budget: remaining goes negative and is not clamped.
// Today's food also lowers the week leftover, so the bank drops to 11500 / 5 = 2300 too.
eq('over budget remaining is negative', budget({ foodByDay: { [TODAY]: 2500 } }).remaining, -200);

// Cap at 6000.
const hugeBase = budget({ baseTarget: 5900, activity: { connected: true, hcActiveKcal: 2000, hcExerciseCount: 1, trainMetKcal: 0 }, goals: { tdee: 9000, bmr: 1000 } });
eq('target never exceeds 6000', hugeBase.todayTarget <= DAY_TARGET_MAX_KCAL, true);
eq('6000 cap value', DAY_TARGET_MAX_KCAL, 6000);

// Blown week: bank is 0, surplus can still add to it, but the target stays ≥ 0.
const blownWeek = budget({ foodByDay: { '2026-10-19': 5000, '2026-10-20': 5000, [TODAY]: 5000 } });
eq('blown week bank is 0 for today', blownWeek.bankedToday, 0);
eq('blown week target is 0 without surplus', blownWeek.todayTarget, 0);
eq('blown week remaining is negative', blownWeek.remaining < 0, true);

// Week fields for the calorie-card line.
eq('week leftover from bank', plain.weekLeftover, 14000);
eq('days left from bank', plain.daysLeft, 5);

// Home copy (spec §9).
eq('surplus > 0 copy', activityCopy({ surplus: 120, burnSource: 'health-connect' }), '+120 kcal from a bigger-than-usual day');
eq('surplus 0 with source copy', activityCopy({ surplus: 0, burnSource: 'train' }), 'Activity is inside your usual target');
eq('no source means no activity copy', activityCopy({ surplus: 0, burnSource: 'none' }), '');
eq('week copy with several days', weekCopy({ weekLeftover: 1200, daysLeft: 3 }), '1,200 kcal left this week · 3 days');
eq('week copy with one day', weekCopy({ weekLeftover: 300, daysLeft: 1 }), '300 kcal left this week · 1 day');

console.log(fails === 0 ? '\nAll day-budget checks passed.' : `\n${fails} day-budget check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
