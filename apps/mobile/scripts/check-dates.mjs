/**
 * Local calendar cutoffs for history queries (npm run check:dates).
 *
 * SQLite date('now') is UTC; logs are stored as local YYYY-MM-DD. History
 * windows must use the local calendar, not UTC.
 */
import { localCutoffDayKey, localDayKey, previousDayKey, shiftDayKey } from '../src/lib/dates.ts';

let fails = 0;
const eq = (label, got, want) => {
  const ok = Object.is(got, want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

const noon = new Date(2026, 8, 9, 12, 0, 0); // 9 Sep 2026 local
eq('local day key ignores clock', localDayKey(noon), '2026-09-09');

eq('1-day window is today', localCutoffDayKey(1, noon), '2026-09-09');
eq('7-day window starts 6 days back', localCutoffDayKey(7, noon), '2026-09-03');
eq('60-day window starts 59 days back', localCutoffDayKey(60, noon), '2026-07-12');

const late = new Date(2026, 0, 1, 23, 59, 0);
eq('late evening is still that local day', localDayKey(late), '2026-01-01');
eq('cutoff from 1 Jan spans back into December', localCutoffDayKey(3, late), '2025-12-30');

// "Copy yesterday" depends on these. The naive `new Date('2026-09-12')` reads as
// UTC midnight, which is the previous local day west of Greenwich — so the whole
// feature would silently copy the wrong day.
eq('yesterday of a mid-month day', previousDayKey('2026-09-12'), '2026-09-11');
eq('yesterday crosses a month boundary', previousDayKey('2026-10-01'), '2026-09-30');
eq('yesterday crosses a year boundary', previousDayKey('2026-01-01'), '2025-12-31');
eq('yesterday handles a leap day', previousDayKey('2024-03-01'), '2024-02-29');
eq('yesterday survives a DST change', previousDayKey('2026-03-29'), '2026-03-28');
eq('shifting forward returns the original day', shiftDayKey(previousDayKey('2026-09-12'), 1), '2026-09-12');
eq('shifting by zero is a no-op', shiftDayKey('2026-09-12', 0), '2026-09-12');
eq('a malformed day key is returned unchanged', shiftDayKey('not-a-day', -1), 'not-a-day');

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
