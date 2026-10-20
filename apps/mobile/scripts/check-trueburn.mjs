/**
 * True Burn: the Adopt/Keep prompt and the persisted override (npm run
 * check:trueburn).
 *
 * This is the one place calibrEAT is tempted to change a user's calorie target
 * on its own, so the decision has to be boringly predictable: a prompt appears
 * only when the user has not already answered the current suggestion, and a
 * "Keep" is remembered for a week. home.tsx composes it with its own guards
 * (`ready`, `overrideKcal == null`), which are deliberately not re-tested here
 * — this suite pins the pure decision and the storage round-trip underneath.
 *
 * The persistence half matters as much as the logic half: `getTrueBurnState`
 * parses JSON out of localStorage, and that JSON is written by an earlier
 * version of the app. A corrupt or hostile blob must degrade to "no opinion",
 * never to a thrown error inside a render.
 */
import {
  getCalorieOverride,
  getTrueBurnState,
  saveTrueBurnState,
  setCalorieOverride,
  shouldShowAdoptPrompt,
} from '../src/lib/trueburn.ts';

let fails = 0;
const eq = (label, got, want) => {
  const ok = Object.is(got, want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};
const ok = (label, cond) => {
  if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
};
const section = (title) => console.log(`\n── ${title} ──`);

/* ── A fake localStorage, so the sync storage path is what runs ──────────
 * trueburn branches on `typeof localStorage`; under node that is undefined,
 * so every call would fall through to the AsyncStorage import and fail. A
 * Map-backed stub exercises the branch the web build actually takes. */
class FakeStorage {
  #map = new Map();
  getItem(k) {
    return this.#map.has(k) ? this.#map.get(k) : null;
  }
  setItem(k, v) {
    this.#map.set(k, String(v));
  }
  removeItem(k) {
    this.#map.delete(k);
  }
  clear() {
    this.#map.clear();
  }
  raw(k) {
    return this.#map.get(k);
  }
}
const KEY_STATE = 'calibreat.trueburn.v1';
const KEY_OVERRIDE = 'calibreat.calorie_override.v1';
const fake = new FakeStorage();
globalThis.localStorage = fake;

const DAY = 86400000;
const ago = (days) => new Date(Date.now() - days * DAY).toISOString();

/* ── A. the prompt decision ────────────────────────────────────────────
 * The contract: show unless the user has already answered THIS suggestion.
 * "This" is the point — a changed suggestion is a new question. */
section('adopt prompt decision');

eq('no suggestion means no prompt', shouldShowAdoptPrompt({}, null), false);
eq('zero is not a suggestion', shouldShowAdoptPrompt({}, 0), false);
eq('undefined is not a suggestion', shouldShowAdoptPrompt({}, undefined), false);

eq('a fresh user is prompted', shouldShowAdoptPrompt({}, 2100), true);

eq(
  'having just adopted this exact target stops the prompt',
  shouldShowAdoptPrompt({ decision: 'adopt', adoptedSuggested: 2100 }, 2100),
  false,
);
eq(
  'a DIFFERENT suggested target re-prompts even after adopting',
  shouldShowAdoptPrompt({ decision: 'adopt', adoptedSuggested: 2100 }, 2400),
  true,
  'the suggestion moved, so it is a new question',
);

eq(
  'having just dismissed this exact target stops the prompt',
  shouldShowAdoptPrompt({ decision: 'keep', lastSeenSuggested: 2100, dismissedAt: ago(0) }, 2100),
  false,
);
eq(
  'keep is remembered for a week',
  shouldShowAdoptPrompt({ decision: 'keep', lastSeenSuggested: 2100, dismissedAt: ago(6) }, 2100),
  false,
);
eq(
  'after seven days it comes back',
  shouldShowAdoptPrompt({ decision: 'keep', lastSeenSuggested: 2100, dismissedAt: ago(8) }, 2100),
  true,
);
eq(
  'a changed target re-prompts immediately despite a recent keep',
  shouldShowAdoptPrompt({ decision: 'keep', lastSeenSuggested: 2100, dismissedAt: ago(1) }, 2400),
  true,
);

// The narrow band where `dismissedAt` is present but not parseable. The
// cooldown cannot be evaluated, so the prompt shows — the user chose "keep"
// for a target we can no longer date, and silently never asking again would
// be the worse failure.
eq(
  'an unparseable dismissal date does not suppress the prompt forever',
  shouldShowAdoptPrompt({ decision: 'keep', lastSeenSuggested: 2100, dismissedAt: 'not-a-date' }, 2100),
  true,
);
eq(
  'a null dismissal date does not suppress the prompt forever',
  shouldShowAdoptPrompt({ decision: 'keep', lastSeenSuggested: 2100, dismissedAt: null }, 2100),
  true,
);
eq(
  'a keep with no dismissal date at all does not suppress the prompt',
  shouldShowAdoptPrompt({ decision: 'keep', lastSeenSuggested: 2100 }, 2100),
  true,
  'no usable timestamp means no cooldown can have started',
);

// A decision recorded against a different suggestion must not silence the
// current one — this is the regression that would make the prompt disappear
// for good after any target change.
eq(
  'a keep recorded against another target does not suppress this one',
  shouldShowAdoptPrompt({ decision: 'keep', lastSeenSuggested: 1800, dismissedAt: ago(1) }, 2100),
  true,
);

/* ── B. state round-trips ─────────────────────────────────────────────── */
section('state persistence');

const KEYS = ['__proto__', 'constructor', 'polluted'];

await saveTrueBurnState({ decision: 'keep', lastSeenSuggested: 2100, dismissedAt: ago(1) });
const reloaded = await getTrueBurnState();
eq('a keep survives a round-trip', reloaded.decision, 'keep');
eq('the target it referred to survives', reloaded.lastSeenSuggested, 2100);

await saveTrueBurnState({ decision: 'adopt', adoptedSuggested: 2400 });
eq('adopt survives a round-trip', (await getTrueBurnState()).decision, 'adopt');

/* ── C. a corrupt or hostile blob degrades, never throws ────────────────
 * This JSON was written by an older build and is read during render. A throw
 * here is a red screen, not a failed assertion. */
section('untrusted storage contents');

async function withRaw(key, raw, fn) {
  fake.setItem(key, raw);
  try {
    return await fn();
  } finally {
    fake.removeItem(key);
  }
}

for (const [label, raw] of [
  ['truncated JSON', '{"decision":"keep"'],
  ['a bare string', '"keep"'],
  ['a number', '7'],
  ['null', 'null'],
  ['an array', '[]'],
  ['a boolean', 'true'],
  ['empty', ''],
]) {
  let threw = null;
  let got;
  try {
    got = await withRaw(KEY_STATE, raw, () => getTrueBurnState());
  } catch (error) {
    threw = error;
  }
  ok(`${label} in storage does not throw`, threw === null);
  // The important half: whatever comes back must be a real object, because
  // home.tsx dereferences `state.decision` on it during render.
  if (!threw) {
    ok(`${label} degrades to a usable object`, got !== null && typeof got === 'object' && !Array.isArray(got));
    ok(`${label} degrades to an empty state`, got !== null && Object.keys(got).length === 0);
  }
}

// A blob that parses but is the wrong shape must not reach the decision
// function as something truthy.
const weird = await withRaw(KEY_STATE, JSON.stringify({ decision: 'yes-please', lastSeenSuggested: 'soon' }), () =>
  getTrueBurnState(),
);
ok('an unknown decision string is not silently treated as a decision', weird.decision === 'yes-please');
eq('an unknown decision still re-prompts rather than locking the prompt', shouldShowAdoptPrompt(weird, 2100), true);

const protoBlob = await withRaw(
  KEY_STATE,
  '{"__proto__":{"polluted":"yes"}}',
  () => getTrueBurnState(),
);
ok('a __proto__ payload in storage does not pollute Object.prototype', ({}).polluted === undefined);
ok('the parsed state does not carry the payload as a real key', !('polluted' in protoBlob));

// A persisted suggestion must not be usable to smuggle a number through.
const stringy = await withRaw(KEY_STATE, JSON.stringify({ decision: 'adopt', adoptedSuggested: '2100' }), () =>
  getTrueBurnState(),
);
eq(
  'a stringified suggestion does not match a numeric one, so the prompt returns',
  shouldShowAdoptPrompt(stringy, 2100),
  true,
);

/* ── D. the calorie override is bounded ─────────────────────────────────
 * getCalorieOverride is the one number that silently replaces a user's
 * target, so out-of-range and non-numeric stored values are dropped rather
 * than honoured. 800 is the floor the app enforces and 6000 the ceiling. */
section('calorie override bounds');

for (const [label, value, want] of [
  ['799 is below the floor', '799', null],
  ['800 is the floor', '800', 800],
  ['6000 is the ceiling', '6000', 6000],
  ['6001 is above the ceiling', '6001', null],
  ['zero is rejected', '0', null],
  ['negative is rejected', '-2000', null],
  ['NaN is rejected', 'NaN', null],
  ['Infinity is rejected', 'Infinity', null],
  ['a float is rounded', '2100.6', 2101],
  ['non-numeric text is rejected', 'lots', null],
  ['an empty string is rejected', '', null],
]) {
  const got = await withRaw(KEY_OVERRIDE, value, () => getCalorieOverride());
  eq(label, got, want);
}

await setCalorieOverride(2400);
eq('an override round-trips', await getCalorieOverride(), 2400);
await setCalorieOverride(2400.7);
eq('a fractional override is rounded on the way in', await getCalorieOverride(), 2401);
await setCalorieOverride(null);
eq('clearing the override removes it', await getCalorieOverride(), null);

/* ── E. the two keys do not collide ──────────────────────────────────── */
section('storage keys are independent');

await saveTrueBurnState({ decision: 'adopt', adoptedSuggested: 2100 });
await setCalorieOverride(1900);
eq('state survives an override write', (await getTrueBurnState()).decision, 'adopt');
eq('the override survives a state write', await getCalorieOverride(), 1900);

for (const key of KEYS) {
  ok(`${key} is never used as a storage key`, !fake.raw(key));
}

console.log(fails === 0 ? '\nAll True Burn checks passed.' : `\n${fails} True Burn check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);