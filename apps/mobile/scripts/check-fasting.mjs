/**
 * Accuracy checks for the fasting timer (npm run check:fasting).
 */
import {
  emptyFastState,
  fastElapsedMs,
  formatElapsed,
  isFasting,
  nextFastMilestone,
  startFast,
  stopFast,
} from '../src/lib/fasting.ts';

let fails = 0;
const eq = (label, got, want) => {
  const ok = Object.is(got, want) || (typeof got === 'number' && typeof want === 'number' && Math.abs(got - want) < 0.01);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

const T0 = Date.parse('2026-09-12T08:00:00Z');
const H = 3600000;

eq('empty state is not fasting', isFasting(emptyFastState(), T0), false);
eq('empty elapsed is 0', fastElapsedMs(emptyFastState(), T0), 0);

const started = startFast(emptyFastState(), T0);
eq('start sets startedAt', typeof started.startedAt, 'string');
eq('started state is fasting', isFasting(started, T0 + 1), true);
eq('elapsed after 0h', fastElapsedMs(started, T0), 0);
eq('elapsed after 14h', fastElapsedMs(started, T0 + 14 * H), 14 * H);

// restarting while already fasting is a no-op (doesn't reset the clock)
const restarted = startFast(started, T0 + 20 * H);
eq('restart while fasting is a no-op', restarted.startedAt, started.startedAt);

// stopping
eq('not fasting before start', isFasting(emptyFastState(), T0), false);
const stopped = stopFast(started, T0 + 16 * H);
eq('stop clears startedAt', stopped.startedAt, null);
eq('stop records duration', stopped.lastDurationMs, 16 * H);
eq('stopped state is not fasting', isFasting(stopped, T0 + 16 * H), false);

// stopping again does nothing (no startedAt)
const stoppedAgain = stopFast(stopped, T0 + 20 * H);
eq('stop when not fasting is a no-op', stoppedAgain.lastDurationMs, 16 * H);

// a new fast after a completed one
const again = startFast(stopped, T0 + 40 * H);
eq('new fast after stop gets a fresh start', again.startedAt !== stopped.startedAt && again.startedAt != null, true);

// stopping with a future-started timestamp (clock skew) ends immediately, no negative duration
const skew = { ...emptyFastState(), startedAt: new Date(T0 + 2 * H).toISOString() };
const skewStopped = stopFast(skew, T0);
eq('clock-skew stop records 0 duration', skewStopped.lastDurationMs, 0);
eq('skewed future start is not fasting', isFasting(skew, T0), false);

// formatting
eq('format 42m', formatElapsed(42 * 60000), '42m');
eq('format 0', formatElapsed(0), '0m');
eq('format 14h05m', formatElapsed(14 * H + 5 * 60000), '14h 05m');
eq('format 16h', formatElapsed(16 * H), '16h 00m');
eq('format 1d03h', formatElapsed(27 * H), '1d 03h');
eq('format negative clamps to 0m', formatElapsed(-5), '0m');

// milestones
eq('milestone at 0h is 12', nextFastMilestone(0)?.hours, 12);
eq('milestone at 13h is 16', nextFastMilestone(13 * H)?.hours, 16);
eq('milestone at 16h is 18', nextFastMilestone(16 * H)?.hours, 18);
eq('milestone past 48h is null', nextFastMilestone(50 * H), null);
eq('milestone in label 4h', nextFastMilestone(12 * H)?.inLabel, '4h 00m');
eq('milestone in label 55m', nextFastMilestone(11 * H + 5 * 60000)?.inLabel, '55m');

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
