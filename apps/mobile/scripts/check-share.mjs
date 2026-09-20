/**
 * Accuracy checks for the share-card content logic (npm run check:share).
 * The card is the app's word-of-mouth surface, so the copy rules are the
 * contract: behavior-first framing, honest numbers, one-time site URL.
 */
import { buildShareCard, burnDriftPhrase, shareCopy, shareTagline } from '../src/lib/share-card.ts';
import { emptyStreak } from '../src/lib/streak.ts';

let fails = 0;
const eq = (label, got, want) => {
  const same =
    Object.is(got, want) ||
    (typeof got === 'number' && typeof want === 'number' && Math.abs(got - want) < 0.01) ||
    (typeof got === 'object' && got !== null && JSON.stringify(got) === JSON.stringify(want));
  if (!same) fails++;
  console.log(`${same ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

const ok = (label, cond) => {
  if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
};

const streak = (current, best) => ({ ...emptyStreak(), current, best });
const burn = (latest, driftPerWeek) => ({ min: latest - 40, max: latest + 40, latest, avg: latest, driftPerWeek, points: 4 });

const stats = (over = {}) => ({ streak: emptyStreak(), coverage: { logged: 0, days: 0 }, burn: null, ...over });

// Empty state: brand-new user has nothing to celebrate — no card.
const empty = buildShareCard(stats());
eq('empty user is not eligible', empty, { eligible: false, reason: 'empty' });

// One logged day is enough — the aha is the logging habit itself.
const first = buildShareCard(stats({ coverage: { logged: 1, days: 2 } }));
eq('one logged day is eligible', first.eligible, true);
eq('one-day copy leads with coverage', first.eligible && first.copy.headline, '1 day logged this week');

// Streak beats coverage for the headline; current run wins over best.
const alive = buildShareCard(stats({ streak: streak(12, 20), coverage: { logged: 6, days: 7 } }));
eq('alive streak headline', alive.eligible && alive.copy.headline, '12-day logging streak');
ok('alive streak subline carries coverage', alive.eligible && /6\/7 days logged/.test(alive.copy.subline));

// Broken run: celebrate the best run, never frame it as failure.
const broken = shareCopy(stats({ streak: streak(0, 14), coverage: { logged: 5, days: 7 } }));
eq('broken run uses best', broken.headline, '14-day best logging run');

// Short streak (1 day) drops to the subline; coverage leads.
const shortRun = shareCopy(stats({ streak: streak(1, 1), coverage: { logged: 3, days: 7 } }));
eq('short streak headline uses coverage', shortRun.headline, '3 days logged this week');
ok('short streak named in subline', /1-day best/.test(shortRun.subline));

// Burn-only user (no streak, no coverage).
const burnOnly = shareCopy(stats({ burn: burn(2140, 8) }));
eq('burn-only headline', burnOnly.headline, '2,140 kcal measured burn');

// Drift phrasing: steady vs moving.
eq('steady drift phrase', burnDriftPhrase(burn(2140, 8)), 'True Burn steady at 2,140');
eq('small drift is steady', burnDriftPhrase(burn(2140, -14)), 'True Burn steady at 2,140');
eq('upward drift phrase', burnDriftPhrase(burn(2140, 45)), 'True Burn up 45 kcal/wk');
eq('downward drift phrase', burnDriftPhrase(burn(2140, -120)), 'True Burn down 120 kcal/wk');

// Copy rules: no body-shaming, exactly one site link, behavior words only.
for (const [name, s] of [
  ['streak card', stats({ streak: streak(9, 9), coverage: { logged: 7, days: 7 }, burn: burn(2100, 30) })],
  ['coverage card', stats({ coverage: { logged: 4, days: 7 } })],
  ['burn card', stats({ burn: burn(1900, -60) })],
]) {
  const card = shareCopy(s);
  const text = `${card.headline} ${card.subline} ${shareTagline()}`.toLowerCase();
  ok(`${name}: no weight/before-after framing`, !/weight|kg|lbs|before|after|body|bmi/.test(text));
  ok(`${name}: no moralizing`, !/should|guilt|cheat|fail|bad/.test(text));
  ok(`${name}: site link appears exactly once`, (text.match(/calibreat\.co\.uk/g) ?? []).length === 1);
}

// Tagline shape.
ok('tagline carries the site', /^Calibrate your eating lifestyle\. — calibreat\.co\.uk$/.test(shareTagline()));

console.log(fails === 0 ? '\nAll share-card checks passed.' : `\n${fails} share-card check(s) FAILED.`);
process.exit(fails === 0 ? 0 : 1);
