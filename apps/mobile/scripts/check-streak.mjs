/**
 * Claim-button streak math (npm run check:streak).
 *
 * The next claim unlocks 24 hours after the last one. Miss a full 24-hour
 * window after that and the run zeros. The week meter is 7 pips.
 */
import { claimStreak, emptyStreak, expireStreak, streakNeedsClaim, weekPips } from '../src/lib/streak.ts';

let fails = 0;
const eq = (label, got, want) => {
  const ok = Object.is(got, want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const t0 = Date.parse('2026-09-09T08:00:00.000Z');

const empty = emptyStreak();
eq('empty current is 0', empty.current, 0);
eq('empty has no last claim', empty.lastClaimedAt, null);
eq('empty best is 0', empty.best, 0);
eq('empty needs a claim', streakNeedsClaim(empty, t0), true);

const first = claimStreak(empty, t0);
eq('first claim is 1', first.current, 1);
eq('first claim stores the instant', first.lastClaimedAt, new Date(t0).toISOString());
eq('first claim sets best', first.best, 1);
eq('inside 24h does not need another claim', streakNeedsClaim(first, t0 + DAY - 1), false);
eq('claim inside 24h is ignored', claimStreak(first, t0 + 3 * HOUR).current, 1);
eq('claim inside 24h keeps the original instant', claimStreak(first, t0 + 3 * HOUR).lastClaimedAt, first.lastClaimedAt);

eq('exactly 24h later needs a claim', streakNeedsClaim(first, t0 + DAY), true);
const next = claimStreak(first, t0 + DAY);
eq('claim at 24h continues the run', next.current, 2);
eq('best tracks the run', next.best, 2);

eq('a live run still lives at 47h', expireStreak(first, t0 + 2 * DAY - 1).current, 1);
const dead = expireStreak(first, t0 + 2 * DAY);
eq('missing the next 24h window zeros the run', dead.current, 0);
eq('best survives a zero', dead.best, 1);
const restart = claimStreak(dead, t0 + 2 * DAY + HOUR);
eq('claim after a miss starts at 1', restart.current, 1);

const legacy = { current: 3, lastClaimedAt: null, lastClaimedDayKey: '2026-09-08', best: 3 };
eq('legacy run still needs a first button claim', streakNeedsClaim(legacy, t0), true);
eq('expire does not wipe a legacy run waiting for its first stamp', expireStreak(legacy, t0).current, 3);
const stamped = claimStreak(legacy, t0);
eq('first button claim keeps the existing run', stamped.current, 3);
eq('first button claim starts the 24h clock', stamped.lastClaimedAt, new Date(t0).toISOString());
eq('first button claim does not need another tap', streakNeedsClaim(stamped, t0 + HOUR), false);

eq('week pips at 0', weekPips(0), 0);
eq('week pips at 1', weekPips(1), 1);
eq('week pips at 7', weekPips(7), 7);
eq('week pips wrap at 8', weekPips(8), 1);
eq('week pips full again at 14', weekPips(14), 7);

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
