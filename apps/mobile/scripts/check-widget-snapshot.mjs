/**
 * Widget snapshot: build, parse and the small-widget copy (run: npm run check:widget).
 * The widget only ever reads what parseWidgetSnapshot accepts, so this pins the
 * contract between the app and the native widget.
 */
import { buildWidgetSnapshot, parseWidgetSnapshot, remainingLine, WIDGET_SNAPSHOT_VERSION } from '../src/lib/widget-snapshot.ts';

let fails = 0;
const eq = (label, got, want) => {
  const ok = Object.is(got, want) || JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

const now = new Date('2026-10-21T12:00:00.000Z');
const base = {
  remaining: 1240,
  proteinG: 88,
  proteinGoalG: 140,
  waterMl: 1500,
  waterGoalMl: 2500,
  fastElapsedSec: null,
  sourceLabel: 'Train estimate',
  now,
};

eq('version is 1', WIDGET_SNAPSHOT_VERSION, 1);
const built = buildWidgetSnapshot(base);
eq('built snapshot carries remaining', built.remaining, 1240);
eq('built snapshot carries updatedAt', built.updatedAt, '2026-10-21T12:00:00.000Z');
eq('built snapshot round-trips through the parser', parseWidgetSnapshot(JSON.parse(JSON.stringify(built))), built);

// Numbers are sanitised on the way in.
const dirty = buildWidgetSnapshot({ ...base, remaining: NaN, proteinG: -5, waterMl: Infinity, fastElapsedSec: -30 });
eq('NaN remaining becomes 0', dirty.remaining, 0);
eq('negative protein clamps to 0', dirty.proteinG, 0);
eq('infinite water clamps to 0', dirty.waterMl, 0);
eq('negative fast elapsed clamps to 0', dirty.fastElapsedSec, 0);

// Parser rejects anything the widget should not trust.
eq('non-object is rejected', parseWidgetSnapshot('nope'), null);
eq('array is rejected', parseWidgetSnapshot([]), null);
eq('null is rejected', parseWidgetSnapshot(null), null);
eq('a future version is rejected', parseWidgetSnapshot({ ...built, v: 2 }), null);
eq('a missing field is rejected', parseWidgetSnapshot({ ...built, waterMl: undefined }), null);
eq('a string number is rejected', parseWidgetSnapshot({ ...built, proteinG: '88' }), null);
eq('a non-numeric remaining is rejected', parseWidgetSnapshot({ ...built, remaining: 'lots' }), null);

// Small-widget copy
eq('positive remaining copy', remainingLine(built), '1,240 kcal left');
eq('negative remaining copy', remainingLine({ ...built, remaining: -320 }), '320 kcal over');
eq('zero remaining copy', remainingLine({ ...built, remaining: 0 }), '0 kcal left');

console.log(fails === 0 ? '\nAll widget snapshot checks passed.' : `\n${fails} widget snapshot check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
