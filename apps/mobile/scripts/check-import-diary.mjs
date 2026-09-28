/**
 * Checks for diary import from MyFitnessPal / Cronometer
 * (run: npm run check:import).
 *
 * Verifies the real implementation (src/lib/import-diary.ts) against the two
 * files users actually hand us. The cases that matter are not the happy path:
 *
 *   - a blank numeric cell must stay *unknown*, not become a confident 0
 *     (`Number('') === 0` is the trap);
 *   - a comma is ambiguous and the two readings differ by 1000x, which is why
 *     the semicolon-sniffed UK Excel file has to be read as decimals;
 *   - D/M/Y vs M/D/Y is decided across the whole file, not per row, and
 *     reported when the file cannot decide it;
 *   - imported rows go through the *same* validator as a backup, so the two
 *     paths cannot drift. That handoff is checked here, not assumed.
 */
import { localDayKey } from '../src/lib/dates.ts';
import {
  describeSource,
  formatDayRange,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  parseCsv,
  readDiaryCsv,
  readNumber,
} from '../src/lib/import-diary.ts';
import { planRestore, RESTORE_MAX_BYTES, RESTORE_MAX_ROWS, validateRestoreRows } from '../src/lib/restore.ts';

let fails = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};
const ok = (label, condition) => {
  if (!condition) fails++;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}`);
};
const refuses = (label, text, fragment, ...args) => {
  const result = readDiaryCsv(text, ...args);
  const good = !result.ok && result.message.toLowerCase().includes(fragment.toLowerCase());
  if (!good) fails++;
  console.log(`${good ? 'PASS' : 'FAIL'}  ${label}: ${result.ok ? 'ACCEPTED (wanted a refusal)' : result.message}`);
};

/* ── Files shaped like the real exports ────────────────────────── */

const MFP = [
  'Date,Time,Meal,Food Name,Calories,Protein (g),Carbohydrates (g),Fat (g),Fiber (g),Sugar,Saturated Fat,Sodium (mg),Weight',
  '2026-09-10,08:00,Breakfast,"Oats, rolled, 50g",320,12.4,55.1,6.2,8.0,1.0,1.1,180,50',
  '2026-09-10,12:30,Lunch,"Chicken breast, grilled",420,62.0,0,7.4,0,0,2.0,1450,180',
  '2026-09-10,18:45,Dinner,Pasta with Bolognese,640,28.5,82.0,18.2,6.5,9.2,5.2,2380,300',
  '2026-09-11,09:15,Snack,"Protein bar, chocolate",210,20.0,18.0,7.0,3.0,2.0,3.0,180,50',
  '2026-09-11,13:00,Lunch,Tuna salad,310,32.0,12.0,14.0,4.0,3.0,2.0,890,220',
  '',
].join('\n');

const CRONOMETER = [
  'Date,Time of Day,Group,Food Name,Energy (kcal),Protein (g),Carbs (g),Fat (g),Fiber (g),Sugars (g),Saturated Fat (g),Sodium (mg),Weight (g)',
  '2026-09-10,08:00,Breakfast,Oats rolled 50g,320,12.4,55.1,6.2,8.0,1.0,1.1,180,50',
  '2026-09-10,19:00,Dinner,Salmon fillet,520,45.0,0,32.0,0,0,7.5,310,160',
  '',
].join('\n');

/* ── The CSV reader itself ─────────────────────────────────────── */

eq('parseCsv splits plain rows', parseCsv('a,b\n1,2')[1], ['1', '2']);
eq('parseCsv keeps a comma inside quotes', parseCsv('a,b\n"x, y",2')[1], ['x, y', '2']);
eq('parseCsv unescapes doubled quotes', parseCsv('a\n"He said ""hi"""')[1], ['He said "hi"']);
eq('parseCsv tolerates CRLF', parseCsv('a,b\r\n1,2\r\n')[1], ['1', '2']);
eq('parseCsv drops the BOM so "Date" still matches', parseCsv('﻿Date,Time\n2026-09-10,08:00')[0], ['Date', 'Time']);
eq('parseCsv drops the trailing blank line', parseCsv('a,b\n1,2\n').length, 2);
eq('parseCsv keeps an embedded newline in quotes', parseCsv('a,b\n"two\nlines",2')[1], ['two\nlines', '2']);

/* ── Blank is not zero ─────────────────────────────────────────── */

eq('a blank cell is unknown, not zero', readNumber(''), null);
eq('a whitespace cell is unknown', readNumber('   '), null);
eq('an absent column is unknown', readNumber(undefined), null);
eq('a real zero stays zero', readNumber('0'), 0);
eq('the export placeholder for no data is unknown', readNumber('--'), null);
eq('N/A is unknown', readNumber('n/a'), null);
eq('junk is unknown rather than NaN', readNumber('about 200'), null);

/* ── The comma, which is worth a thousand ──────────────────────── */

eq('1,200 with no dot is one thousand two hundred', readNumber('1,200'), 1200);
eq('12,500 is twelve thousand five hundred', readNumber('12,500'), 12500);
eq('1,234,567 strips every thousands group', readNumber('1,234,567'), 1234567);
eq('70,5 is a decimal comma', readNumber('70,5'), 70.5);
eq('1,23 is a decimal comma', readNumber('1,23'), 1.23);
eq('a dot settles it: 1,200.5', readNumber('1,200.5'), 1200.5);
eq('0,5 is a decimal comma', readNumber('0,5'), 0.5);

/* ── MyFitnessPal ──────────────────────────────────────────────── */

const mfp = readDiaryCsv(MFP);
ok('the MyFitnessPal file is read', mfp.ok);
eq('it is recognised as MyFitnessPal', mfp.ok && mfp.scan.source, 'myfitnesspal');
eq('every row is read', mfp.ok && mfp.scan.rows.length, 5);
eq('quoted commas survive into the food name', mfp.ok && mfp.scan.rows[0].name, 'Oats, rolled, 50g');
eq('breakfast maps to the breakfast slot', mfp.ok && mfp.scan.rows[0].meal, 'breakfast');
eq('dinner maps to the dinner slot', mfp.ok && mfp.scan.rows[2].meal, 'dinner');
eq('snack maps to the snack slot', mfp.ok && mfp.scan.rows[3].meal, 'snack');
eq('two distinct days are counted', mfp.ok && mfp.scan.days, 2);
eq('the range starts on the first day', mfp.ok && mfp.scan.firstDay, '2026-09-10');
eq('the range ends on the last day', mfp.ok && mfp.scan.lastDay, '2026-09-11');
eq('a clean file is not left with notes', mfp.ok && mfp.scan.unusable, 0);
eq('nothing needed reinterpreting', mfp.ok && mfp.scan.sodiumWasGrams, false);
eq('macros come through', mfp.ok && [mfp.scan.rows[0].kcal, mfp.scan.rows[0].proteinG, mfp.scan.rows[0].carbsG], [320, 12.4, 55.1]);

/* ── …and Cronometer, whose headers all differ ─────────────────── */

const cron = readDiaryCsv(CRONOMETER);
ok('the Cronometer file is read', cron.ok);
eq('it is recognised as Cronometer', cron.ok && cron.scan.source, 'cronometer');
eq('its rows are read', cron.ok && cron.scan.rows.length, 2);
eq('"Time of Day" and "Energy (kcal)" map across', cron.ok && cron.scan.rows[0].kcal, 320);
eq('"Group" is read as the meal slot', cron.ok && cron.scan.rows[1].meal, 'dinner');
eq('"Carbs (g)" is read as carbs', cron.ok && cron.scan.rows[0].carbsG, 55.1);

/* ── Times and days come back intact ───────────────────────────── */

const first = mfp.ok ? mfp.scan.rows[0] : null;
ok('08:00 is read as eight in the morning', first !== null && new Date(first.loggedAt).getHours() === 8);
ok('the day survives the trip through a timestamp', first !== null && localDayKey(new Date(first.loggedAt)) === '2026-09-10');
eq('the day key is passed through untouched', first?.dayKey, '2026-09-10');

const NO_TIME = ['Date,Meal,Food Name,Calories', '2026-09-10,Breakfast,Oats,320', ''].join('\n');
const noTime = readDiaryCsv(NO_TIME);
ok('a file with no time column still imports', noTime.ok);
eq('an untimed row lands at midday', noTime.ok && new Date(noTime.scan.rows[0].loggedAt).getHours(), 12);
ok('the missing times are reported', noTime.ok && noTime.scan.notes.some((n) => n.includes('no time')));

const AMPM = ['Date,Time,Meal,Food Name,Calories', '2026-09-10,8:30 PM,Dinner,Stew,600', ''].join('\n');
const ampm = readDiaryCsv(AMPM);
eq('"8:30 PM" is read as twenty in the evening', ampm.ok && new Date(ampm.scan.rows[0].loggedAt).getHours(), 20);

/* ── Dates: decided across the file, and said out loud ─────────── */

const AMBIGUOUS = [
  'Date,Time,Meal,Food Name,Calories',
  '01/02/2026,08:00,Breakfast,Porridge,300',
  '03/04/2026,12:00,Lunch,Soup,250',
  '',
].join('\n');
const amb = readDiaryCsv(AMBIGUOUS);
ok('a wholly ambiguous file is still read', amb.ok);
eq('ambiguity is flagged, not hidden', amb.ok && amb.scan.ambiguousDates, true);
eq('it reads day-first by default', amb.ok && amb.scan.rows[0].dayKey, '2026-02-01');
ok('and says which reading it used', amb.ok && amb.scan.notes.some((n) => n.includes('D/M/Y')));
eq('the other reading is one tap away', readDiaryCsv(AMBIGUOUS, 'mdy').ok && readDiaryCsv(AMBIGUOUS, 'mdy').scan.rows[0].dayKey, '2026-01-02');
eq('and 03/04 moves with it', readDiaryCsv(AMBIGUOUS, 'mdy').ok && readDiaryCsv(AMBIGUOUS, 'mdy').scan.rows[1].dayKey, '2026-03-04');

const DECISIVE_DMY = ['Date,Time,Meal,Food Name,Calories', '03/04/2026,12:00,Lunch,Soup,250', '25/12/2026,12:00,Lunch,Turkey,600', ''].join('\n');
const dmy = readDiaryCsv(DECISIVE_DMY);
eq('a day over 12 settles it as day-first', dmy.ok && dmy.scan.dateOrder, 'dmy');
eq('with no ambiguity to report', dmy.ok && dmy.scan.ambiguousDates, false);
eq('25/12 reads correctly', dmy.ok && dmy.scan.rows[1].dayKey, '2026-12-25');

const DECISIVE_MDY = ['Date,Time,Meal,Food Name,Calories', '12/25/2026,12:00,Lunch,Turkey,600', '03/04/2026,12:00,Lunch,Soup,250', ''].join('\n');
eq('a month over 12 settles it as month-first', readDiaryCsv(DECISIVE_MDY).ok && readDiaryCsv(DECISIVE_MDY).scan.dateOrder, 'mdy');
eq('12/25 reads as 25 December', readDiaryCsv(DECISIVE_MDY).ok && readDiaryCsv(DECISIVE_MDY).scan.rows[0].dayKey, '2026-12-25');
eq('an ISO file needs no guessing', readDiaryCsv(CRONOMETER).ok && readDiaryCsv(CRONOMETER).scan.dateOrder, 'ymd');

/* ── The things a hand-edited sheet does ───────────────────────── */

const UK_EXCEL = [
  'Date;Time;Meal;Food Name;Calories;Protein (g)',
  '2026-09-10;08:00;Breakfast;Oats;320;12,4',
  '2026-09-10;19:00;Dinner;Stew;640;31,25',
  '',
].join('\n');
const uk = readDiaryCsv(UK_EXCEL);
ok('a semicolon-separated file is read', uk.ok);
eq('"12,4" is twelve point four, not a thousand', uk.ok && uk.scan.rows[0].proteinG, 12.4);
eq('"31,25" is thirty-one and a quarter', uk.ok && uk.scan.rows[1].proteinG, 31.25);
eq('and the semicolons did not become part of a name', uk.ok && uk.scan.rows[0].name, 'Oats');

const BLANKS = [
  'Date,Time,Meal,Food Name,Calories,Protein (g),Fat (g)',
  '2026-09-10,08:00,Breakfast,Oats,320,,',
  '2026-09-10,12:00,Lunch,Soup,250,0,0',
  '',
].join('\n');
const blanks = readDiaryCsv(BLANKS);
eq('a blank macro is unknown, not a measurement of 0', blanks.ok && blanks.scan.rows[0].proteinG, null);
eq('a real 0 in the same column is kept as 0', blanks.ok && blanks.scan.rows[1].proteinG, 0);
eq('and both rows still import — losing a macro is not losing the meal', blanks.ok && blanks.scan.rows.length, 2);

const SODIUM_GRAMS = [
  'Date,Time,Meal,Food Name,Calories,Sodium',
  '2026-09-10,08:00,Breakfast,Oats,320,0.18',
  '2026-09-10,12:00,Lunch,Soup,250,0.89',
  '',
].join('\n');
const grams = readDiaryCsv(SODIUM_GRAMS);
eq('unitless sodium below 20 is read as grams and converted', grams.ok && grams.scan.rows[0].sodiumMg, 180);
eq('every value in the column is converted', grams.ok && grams.scan.rows[1].sodiumMg, 890);
eq('and the conversion is reported, not silent', grams.ok && grams.scan.sodiumWasGrams, true);
ok('with a note explaining it', grams.ok && grams.scan.notes.some((n) => n.includes('grams')));
eq('a header that says mg is left alone', mfp.ok && mfp.scan.rows[1].sodiumMg, 1450);

const UNMAPPED = [
  'Date,Time,Group,Food Name,Energy (kcal)',
  '2026-09-10,22:00,Supper,Toast,200',
  '2026-09-10,23:00,Late night,Crisps,180',
  '',
].join('\n');
const unmapped = readDiaryCsv(UNMAPPED);
eq('a group that names a real slot is placed in it', unmapped.ok && unmapped.scan.rows[0].meal, 'dinner');
eq('a group with no slot still lands somewhere sensible', unmapped.ok && unmapped.scan.rows[1].meal, 'snack');
eq('an unknown group is recorded', unmapped.ok && unmapped.scan.unmappedGroups, ['Late night']);
ok('and the user is told it became a snack', unmapped.ok && unmapped.scan.notes.some((n) => n.includes('snacks')));

const UNUSABLE = [
  'Date,Time,Meal,Food Name,Calories',
  ',08:00,Breakfast,No date,300',
  'not-a-date,08:00,Breakfast,Bad date,300',
  '2026-02-31,08:00,Breakfast,Impossible date,300',
  '2026-09-10,08:00,Breakfast,No calories,',
  '2026-09-10,08:00,Breakfast,No calories either,--',
  '2026-09-10,12:00,Lunch,Real meal,400',
  '',
].join('\n');
const unusable = readDiaryCsv(UNUSABLE);
eq('the readable row survives', unusable.ok && unusable.scan.rows.length, 1);
eq('the five unreadable rows are counted, not swallowed', unusable.ok && unusable.scan.unusable, 5);
ok('and the count is shown before anything is written', unusable.ok && unusable.scan.notes.some((n) => n.includes('left out')));

/* ── Refusals ──────────────────────────────────────────────────── */

refuses('an empty file', '', 'empty');
refuses('a whitespace file', '   \n  ', 'empty');
refuses('a file with a header and no rows', 'Date,Time,Meal,Food Name,Calories\n', 'no rows');
refuses('a file with no calorie column', 'Date,Time,Meal,Food Name\n2026-09-10,08:00,Breakfast,Oats\n', 'calorie');
refuses('a file with no date column', 'Time,Meal,Food Name,Calories\n08:00,Breakfast,Oats,320\n', 'date');
refuses('a file where nothing is usable', 'Date,Time,Meal,Food Name,Calories\n,08:00,Breakfast,Oats,\n', 'no rows');
refuses('a file larger than the cap', `Date,Calories\n${'x'.repeat(IMPORT_MAX_BYTES + 10)}`, 'too large');

/* ── The handoff: imported rows go through the backup's validator ──
 * This is the check that matters most. If the import ever grew its own idea
 * of what a good row is, the two paths would drift and one would quietly
 * accept something the other rejects. */

const validated = validateRestoreRows({ logEntries: mfp.ok ? mfp.scan.rows : [] });
ok('the rows the importer produced are accepted by the backup validator', validated.ok);
eq('all five survive validation', validated.ok && validated.bundle.logEntries.length, 5);
ok('with no warnings, because the importer already filtered', validated.ok && validated.warnings.length === 0);
eq('the meal slot is the one the app uses', validated.ok && validated.bundle.logEntries[0].meal, 'breakfast');
eq('the day is the one from the file', validated.ok && validated.bundle.logEntries[0].dayKey, '2026-09-10');
eq('the timestamp is the one from the file', validated.ok && new Date(validated.bundle.logEntries[0].loggedAt).getHours(), 8);
ok('and the null macros are still valid SQL bind values', (() => {
  if (!blanks.ok) return false;
  const rows = validateRestoreRows({ logEntries: blanks.scan.rows });
  return rows.ok && rows.bundle.logEntries[0].fiberG === null && rows.bundle.logEntries[0].proteinG === null;
})());
eq('a missing macro is not invented as zero', (() => {
  if (!blanks.ok) return 'skipped';
  const rows = validateRestoreRows({ logEntries: blanks.scan.rows });
  return rows.ok ? rows.bundle.logEntries[0].proteinG : 'rejected';
})(), null);

const plan = validated.ok ? planRestore(validated.bundle) : null;
ok('the validated rows plan cleanly', plan !== null);
eq('the plan holds every meal', plan?.logEntries.length, 5);
eq('nothing was treated as a duplicate', plan?.duplicates, 0);
eq('an import never clears the device', plan?.clears, false);
ok('and it does not touch a profile it never read', plan?.profile === null || plan?.profile === undefined);

/* Importing the same file twice must change nothing — the property that makes
 * it safe to try the import, decide it was wrong, and try again. */
const again = validated.ok
  ? planRestore(validated.bundle, {
      logEntries: plan.logEntries,
      weighIns: [],
      water: [],
      workouts: [],
      savedMeals: [],
      hasProfile: true,
    })
  : null;
eq('a second import of the same file adds nothing', again?.logEntries.length, 0);
eq('and counts all five as already here', again?.duplicates, 5);

/* The importer is only useful if it can add to a diary that already has one,
 * so an import that collides with existing days must still bring the rest. */
const overlapping = validated.ok
  ? planRestore(validated.bundle, {
      logEntries: [plan.logEntries[0]],
      weighIns: [],
      water: [],
      workouts: [],
      savedMeals: [],
      hasProfile: true,
    })
  : null;
eq('an overlapping import keeps the four new days', overlapping?.logEntries.length, 4);
eq('and skips only the one it already had', overlapping?.duplicates, 1);

/* ── Drift guards: the constants this file mirrors ─────────────── */

eq('the byte cap agrees with restore', IMPORT_MAX_BYTES, RESTORE_MAX_BYTES);
eq('the row cap agrees with restore', IMPORT_MAX_ROWS, RESTORE_MAX_ROWS);

/* ── Copy ──────────────────────────────────────────────────────── */

eq('MyFitnessPal is named', describeSource('myfitnesspal'), 'MyFitnessPal');
eq('Cronometer is named', describeSource('cronometer'), 'Cronometer');
eq('an unrecognised file says so honestly', describeSource('unknown'), 'another app');
eq('a range reads as dates', formatDayRange('2026-09-10', '2026-09-11'), '10 Sep 2026 – 11 Sep 2026');
eq('a single day reads as one date', formatDayRange('2026-09-10', '2026-09-10'), '10 Sep 2026');
eq('no range reads as nothing', formatDayRange(null, null), '');
ok('every note ends in a full stop', mfp.ok && mfp.scan.notes.every((n) => n.trim().endsWith('.')));

console.log(fails === 0 ? '\nAll import checks passed.' : `\n${fails} import check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
