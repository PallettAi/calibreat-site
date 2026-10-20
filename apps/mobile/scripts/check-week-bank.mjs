/**
 * Monday–Sunday calorie bank (run: npm run check:week).
 *
 * Fixtures are fixed calendar dates, so the result does not depend on the
 * machine clock or timezone.
 */
import { computeWeekBank, mondayIndex, weekKeys } from '../src/lib/week-bank.ts';

let fails = 0;
const eq = (label, got, want) => {
  const ok = Object.is(got, want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

// 2026-10-19 is a Monday; 2026-10-18 is a Sunday.
eq('2026-10-19 is Monday index 0', mondayIndex('2026-10-19'), 0);
eq('2026-10-25 is Sunday index 6', mondayIndex('2026-10-25'), 6);
eq('Sunday 2026-10-18 belongs to the week starting 2026-10-12', weekKeys('2026-10-18')[0], '2026-10-12');
eq('week spans seven keys', weekKeys('2026-10-21').length, 7);
eq('week crosses a month boundary', weekKeys('2026-11-01')[0], '2026-10-26');
eq('malformed key has no week', weekKeys('19-10-2026'), null);
eq('malformed key has no bank', computeWeekBank({ todayKey: 'oops', baseTarget: 2000, foodByDay: {} }), null);

const bank = (todayKey, foodByDay = {}, baseTarget = 2000) => computeWeekBank({ todayKey, baseTarget, foodByDay });

// Days left: Monday = 7, Sunday = 1.
eq('Monday has 7 days left', bank('2026-10-19').daysLeft, 7);
eq('Wednesday has 5 days left', bank('2026-10-21').daysLeft, 5);
eq('Sunday has 1 day left', bank('2026-10-25').daysLeft, 1);

// Untouched week: pool and bank both base.
const fresh = bank('2026-10-19');
eq('pool is 7 × base', fresh.weekPool, 14000);
eq('nothing eaten, leftover = pool', fresh.weekLeftover, 14000);
eq('Monday bank is base with no food', fresh.bankedToday, 2000);

// Under target on Monday raises the rest of the week.
const underMon = bank('2026-10-19', { '2026-10-19': 1500 });
eq('Monday under by 500: leftover', underMon.weekLeftover, 12500);
eq('Monday under by 500: bank is 12500 / 7, rounded', underMon.bankedToday, 1786);

// Over target on Monday lowers the rest of the week (not clamped away).
const overMon = bank('2026-10-19', { '2026-10-19': 2300 });
eq('Monday over by 300: leftover', overMon.weekLeftover, 11700);
eq('Monday over by 300: bank is raw share, 11700 / 7', overMon.bankedToday, 1671);

// Tuesday and Wednesday with normal eating: bank stays at base.
const steady = bank('2026-10-21', { '2026-10-19': 2000, '2026-10-20': 2000, '2026-10-21': 500 });
eq('steady week: leftover is pool − food to date', steady.weekLeftover, 14000 - 4500);
eq('steady week: food to date counts through today only', steady.foodToDate, 4500);

// Food after today must not count toward the bank.
const future = bank('2026-10-21', { '2026-10-21': 500, '2026-10-24': 9000 });
eq('future days do not reduce leftover', future.foodToDate, 500);

// Clamp at ±400 on a big swing.
const bigUnder = bank('2026-10-25', {}); // Sunday, 1 day left, full pool
eq('Sunday with full pool clamps to base + 400', bigUnder.bankedToday, 2400);
// Unlogged earlier days count as 0 eaten, so a fresh Wednesday raises its bank.
eq('fresh Wednesday with no food: 14000 / 5 clamps to base + 400', bank('2026-10-21').bankedToday, 2400);

// A blown week shows 0 from the bank, not base − 400.
const blown = bank('2026-10-22', { '2026-10-19': 4000, '2026-10-20': 4000, '2026-10-21': 4000, '2026-10-22': 3000 });
eq('blown week leftover is negative', blown.weekLeftover < 0, true);
eq('blown week bank is 0', blown.bankedToday, 0);

// Today cannot be promised more than the leftover.
const tightSunday = bank('2026-10-25', { '2026-10-19': 2000, '2026-10-20': 2000, '2026-10-21': 2000, '2026-10-22': 2000, '2026-10-23': 2000, '2026-10-24': 2000 });
eq('Sunday leftover is 2000, so bank is 2000', tightSunday.bankedToday, 2000);
const nearlyDone = bank('2026-10-25', { '2026-10-19': 2000, '2026-10-20': 2000, '2026-10-21': 2000, '2026-10-22': 2000, '2026-10-23': 2000, '2026-10-24': 2000, '2026-10-25': 1900 });
eq('Sunday with 100 kcal left: bank is capped at leftover', nearlyDone.bankedToday, 100);

// Corrupt inputs
eq('negative base is treated as 0', bank('2026-10-19', {}, -500).weekPool, 0);
eq('NaN food is ignored', bank('2026-10-19', { '2026-10-19': NaN }).foodToDate, 0);

console.log(fails === 0 ? '\nAll week-bank checks passed.' : `\n${fails} week-bank check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
