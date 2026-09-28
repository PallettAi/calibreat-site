/**
 * Accuracy checks for the share-card content logic (npm run check:share).
 * The card is the app's word-of-mouth surface, so the copy rules are the
 * contract: behavior-first framing, honest numbers, one-time site URL.
 */
import {
  buildShareCard,
  burnDriftPhrase,
  shareAchievement,
  shareBestRow,
  shareCopy,
  shareDateLabel,
  shareEyebrow,
  shareHero,
  shareProgress,
  shareRows,
  shareStatus,
  shareStripRow,
  shareTagline,
  SHARE_SITE_URL,
} from '../src/lib/share-card.ts';
import { arcGlyphs, arcStepFor, fitArc } from '../src/lib/share-arc.ts';
import { shareQrMatrix } from '../src/lib/share-qr.ts';
import { emptyStreak } from '../src/lib/streak.ts';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_SHARE_FORMAT,
  DEFAULT_SHARE_TEMPLATE,
  SHARE_DECOR_LAYER_STYLE,
  SHARE_FORMATS,
  SHARE_FORMAT_IDS,
  SHARE_RENDER_SCALE,
  SHARE_TEMPLATES,
  SHARE_TEMPLATE_IDS,
  getShareFormat,
  getShareTemplate,
  isShareFormatId,
  isShareTemplateId,
  shareCaption,
  shareCardSize,
  shareFileName,
  shareLayout,
  splitBudget,
  fitLines,
  fitWidth,
  displayTracking,
  shareRandom,
  specklePaths,
} from '../src/lib/share-templates.ts';

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

// ── QR code (the on-device growth loop) ───────────────────────────────────
// The matrix must encode the site URL and be renderable at the card's cell
// size. qrcode-generator is the source of truth; these checks pin the shape.
const matrix = shareQrMatrix();
ok('qr matrix is square and sized like a version-2 code (21–29 modules)',
  matrix.length >= 21 && matrix.length <= 29 && matrix.every((row) => row.length === matrix.length));
ok('qr matrix has dark modules', matrix.some((row) => row.some(Boolean)));
// Finder patterns: three 7×7 dark rings with white gap and dark center — if
// these decode wrong, nothing scans. (A standard QR has no bottom-right
// finder; that corner holds the alignment pattern, checked separately.)
const corners = [[0, 0], [0, matrix.length - 7], [matrix.length - 7, 0]];
const finderIntact = corners.every(([r0, c0]) => {
  for (let i = 0; i < 7; i++) {
    // 7×7 dark border on all four edges.
    if (!matrix[r0][c0 + i] || !matrix[r0 + 6][c0 + i] || !matrix[r0 + i][c0] || !matrix[r0 + i][c0 + 6]) return false;
  }
  for (let i = 1; i <= 5; i++) {
    // 5×5 white ring just inside the border (rows/cols at offset 1 and 5).
    if (matrix[r0 + 1][c0 + i] || matrix[r0 + 5][c0 + i] || matrix[r0 + i][c0 + 1] || matrix[r0 + i][c0 + 5]) return false;
  }
  for (let r = 2; r <= 4; r++) {
    for (let c = 2; c <= 4; c++) {
      // 3×3 dark center.
      if (!matrix[r0 + r][c0 + c]) return false;
    }
  }
  return true;
});
ok('qr finder patterns intact in all three corners', finderIntact);
// Alignment pattern (version ≥ 2): a 5×5 ring centred at (n-7, n-7).
const a0 = matrix.length - 7 - 2;
const alignmentIntact =
  [0, 1, 2, 3, 4].every((i) => matrix[a0][a0 + i] && matrix[a0 + 4][a0 + i] && matrix[a0 + i][a0] && matrix[a0 + i][a0 + 4]) &&
  [1, 2, 3].every((i) => !matrix[a0 + 1][a0 + i] && !matrix[a0 + 3][a0 + i] && !matrix[a0 + i][a0 + 1] && !matrix[a0 + i][a0 + 3]) &&
  matrix[a0 + 2][a0 + 2] === true;
ok('qr alignment pattern intact', alignmentIntact);
// URL mode 'Byte' always yields 25 modules at level M for this host — a size
// change would silently shrink the on-card cell size, so pin it.
ok('qr encodes the site url at the expected size', matrix.length === 25);

// The whole card's copy (headline, subline, tagline) plus the QR caption must
// obey the behaviour-first rules — the QR caption is new copy on the card.
const qrCaption = 'SCAN TO VISIT CALIBREAT.CO.UK';
ok('qr caption carries no sensitive framing', !/weight|kg|lbs|bmi|body/.test(qrCaption.toLowerCase()));

// ── Formats: the shape the platform receives ──────────────────────────────
// The image ships to Instagram, a Story, X and Facebook. Each has a size it
// wants; a wrong ratio is the difference between a post and a letterboxed mess.
const EXPECTED_FORMATS = {
  square: [1080, 1080],
  portrait: [1080, 1350],
  story: [1080, 1920],
  wide: [1200, 630],
};
for (const [id, [w, h]] of Object.entries(EXPECTED_FORMATS)) {
  eq(`${id} format is ${w}×${h}`, [SHARE_FORMATS[id].width, SHARE_FORMATS[id].height], [w, h]);
}
ok('every format id in the list resolves', SHARE_FORMAT_IDS.every((id) => getShareFormat(id).id === id));
ok('unknown format falls back instead of throwing', getShareFormat('nope').id === DEFAULT_SHARE_FORMAT);
ok('format ids are validated', isShareFormatId('story') && !isShareFormatId('portait'));
// Stories are the only shape the platform covers with its own chrome, so they
// are the only ones that need content kept away from the top and bottom.
ok('only the story reserves a safe area',
  SHARE_FORMAT_IDS.every((id) => (id === 'story' ? SHARE_FORMATS[id].safeTopPx > 0 && SHARE_FORMATS[id].safeBottomPx > 0 : SHARE_FORMATS[id].safeTopPx === 0 && SHARE_FORMATS[id].safeBottomPx === 0)));
// Story safe area must leave a usable middle: 1920 - 250 - 340 = 1330 px.
ok('story safe area leaves a usable frame',
  SHARE_FORMATS.story.height - SHARE_FORMATS.story.safeTopPx - SHARE_FORMATS.story.safeBottomPx >= 1200);

// Layout size is an exact division of the output, so the capture never has to
// resample a fraction of a pixel (that is what makes text look soft).
for (const id of SHARE_FORMAT_IDS) {
  const size = shareCardSize(id);
  eq(`${id} base width × scale = output width`, size.baseWidth * SHARE_RENDER_SCALE, size.outputWidth);
  eq(`${id} base height × scale = output height`, size.baseHeight * SHARE_RENDER_SCALE, size.outputHeight);
  ok(`${id} base size is an integer`, Number.isInteger(size.baseWidth) && Number.isInteger(size.baseHeight));
}
// A story is ~1.8× the height of the default portrait, so one hard-coded type
// size would either crowd the square or look lost in the story.
ok('type scales up from square to story',
  shareLayout(shareCardSize('story')).hero > shareLayout(shareCardSize('square')).hero);
ok('wide (short) layout uses the smaller hero',
  shareLayout(shareCardSize('wide')).hero < shareLayout(shareCardSize('portrait')).hero);
ok('text never drops below 9 px at base scale',
  SHARE_FORMAT_IDS.every((id) => {
    const l = shareLayout(shareCardSize(id));
    return l.body >= 9 && l.label >= 9;
  }));

// ── The frame must fit its own content ────────────────────────────────────
// A card is a fixed-size box with `overflow: hidden`: anything taller than the
// frame is silently cropped out of the PNG. The first version of the renderer
// overflowed every tall format by 60–130 px and posted cards with no QR code
// and no site link, so the arithmetic is checked, not eyeballed.
for (const id of SHARE_FORMAT_IDS) {
  const size = shareCardSize(id);
  const l = shareLayout(size);
  const bands = l.footerH > 0 ? 2 : 1;
  const used =
    size.safeTop + size.safeBottom + l.pad * 2 + l.headerH + l.mainH + l.footerH + l.gap * bands;
  ok(`${id}: bands + padding exactly fill the card`, used === size.baseHeight);
  ok(`${id}: main block has room to work with`, l.mainH >= 44);
  // The footer is the growth mechanism — never shrink the QR below a size a
  // phone camera can still resolve from a screenshot.
  ok(`${id}: QR stays scannable`, l.qrSize >= 22);
  // On a story the QR and tagline must clear Instagram's reply bar.
  ok(`${id}: footer stays inside the safe area`,
    size.safeBottom === 0 || l.footerH <= size.baseHeight - size.safeTop - size.safeBottom - l.pad);
}
ok('wide cards fold the QR into a rail instead of a footer band',
  shareLayout(shareCardSize('wide')).footerH === 0 && shareLayout(shareCardSize('wide')).railFooter === true);
// The wide card has no footer band, so its QR is the only way off the image:
// it has to be big enough to read from a feed, not token-sized.
ok('wide rail QR is big enough to scan from a feed',
  shareLayout(shareCardSize('wide')).qrSize >= 56);
ok('story reserves the most safe area, portrait none',
  shareCardSize('story').safeBottom > shareCardSize('portrait').safeBottom);

// splitBudget is the guarantee: parts can never exceed the whole.
for (const weights of [[34, 14, 28, 14, 6, 4], [40, 16, 36, 0, 6, 2], [100], [1, 1, 1], [9, 34, 6, 16, 29, 6]]) {
  for (const total of [0, 1, 7, 44, 118, 205, 276, 397]) {
    const parts = splitBudget(total, weights);
    const sum = parts.reduce((a, b) => a + b, 0);
    ok(`splitBudget(${total}, [${weights}]) sums to exactly ${total}`, sum === total);
    ok(`splitBudget(${total}, [${weights}]) never goes negative`, parts.every((p) => p >= 0 && Number.isInteger(p)));
  }
}
ok('splitBudget tolerates zero weights', JSON.stringify(splitBudget(100, [0, 0, 0])) === '[0,0,0]');
ok('splitBudget tolerates a zero budget', JSON.stringify(splitBudget(0, [3, 2])) === '[0,0]');

// fitLines/fitWidth must shrink as the box shrinks, or a block that gets less
// space keeps its big type and overflows.
ok('fitLines shrinks as the box shrinks', fitLines(40, 2) < fitLines(80, 2));
ok('fitLines shrinks as lines are added', fitLines(80, 3) < fitLines(80, 1));
ok('fitLines never returns unusable type', fitLines(1, 4) >= 9);
ok('fitWidth shrinks as characters are added', fitWidth(300, 20) < fitWidth(300, 4));
ok('fitWidth keeps a floor', fitWidth(1, 40) >= 9);
// Every block a template is handed must be able to hold readable type.
for (const id of SHARE_FORMAT_IDS) {
  const l = shareLayout(shareCardSize(id), { heroChars: 4 });
  const [panel, hero] = splitBudget(l.mainH, [34, 28, 38]);
  ok(`${id}: headline still readable in its block`, fitLines(panel, 2) >= 11);
  ok(`${id}: hero still readable in its block`, fitLines(hero, 1) >= 20);
}
// ── Display typography + grain ───────────────────────────────────────────
// The look depends on display type: a numeral big enough to be the composition,
// with tracking that closes up as it grows. Without that the card is a table.
ok('display tracking tightens as type grows', displayTracking(40) < displayTracking(20));
ok('display tracking never flips to positive', displayTracking(200) < 0 && displayTracking(8) < 0);
ok('the hero numeral is display scale, not body scale',
  SHARE_FORMAT_IDS.every((id) => shareLayout(shareCardSize(id)).hero >= shareLayout(shareCardSize(id)).body * 3));

// Grain must be deterministic (two people sharing the same week get the same
// image, and the off-screen stage must not shimmer on re-render) and bounded to
// the card, or it becomes a speck on the caption text.
const grainA = specklePaths({ width: 360, height: 640, count: 200, seed: 4404 });
const grainB = specklePaths({ width: 360, height: 640, count: 200, seed: 4404 });
ok('grain is deterministic for a seed', JSON.stringify(grainA) === JSON.stringify(grainB));
ok('a different seed gives different grain',
  JSON.stringify(specklePaths({ width: 360, height: 640, count: 200, seed: 7 })) !== JSON.stringify(grainA));
ok('grain splits into opacity tiers', grainA.length === 3 && grainA.every((l) => l.alpha > 0 && l.alpha <= 1));
ok('grain stays inside the frame', grainA.every((l) => {
  const coords = [...l.d.matchAll(/M([\d.]+) ([\d.]+)/g)];
  return coords.length > 0 && coords.every(([, x, y]) => Number(x) >= 0 && Number(x) <= 360 && Number(y) >= 0 && Number(y) <= 640);
}));
ok('grain batches flecks into few paths', grainA.every((l) => (l.d.match(/M/g) ?? []).length > 0));
ok('empty grain is safe', specklePaths({ width: 10, height: 10, count: 0, seed: 1 }).length === 0);
ok('PRNG output is in [0,1)', Array.from({ length: 200 }, shareRandom(99)).every((v) => v >= 0 && v < 1));
ok('PRNG is reproducible', shareRandom(3)() === shareRandom(3)());
ok('share file name names the format and template',
  shareFileName('story', 'grid') === 'calibreat-story-grid.png');
ok('caption carries the site once',
  (shareCaption(SHARE_SITE_URL).match(/calibreat\.co\.uk/g) ?? []).length === 1);

// ── Templates: distinct looks, honest labels, AA-readable pairs ───────────
ok('every template id in the list resolves', SHARE_TEMPLATE_IDS.every((id) => getShareTemplate(id).id === id));
ok('unknown template falls back instead of throwing', getShareTemplate('nope').id === DEFAULT_SHARE_TEMPLATE);
ok('template ids are validated', isShareTemplateId('terminal') && !isShareTemplateId('Terminal'));
ok('every look has a distinct name', new Set(SHARE_TEMPLATE_IDS.map((id) => SHARE_TEMPLATES[id].name)).size === SHARE_TEMPLATE_IDS.length);
ok('the achievement idiom leads the picker', SHARE_TEMPLATE_IDS[0] === 'medal' && DEFAULT_SHARE_TEMPLATE === 'medal');
ok('every template has a blurb', SHARE_TEMPLATE_IDS.every((id) => SHARE_TEMPLATES[id].blurb.length > 4));
ok('every template points at a real format', SHARE_TEMPLATE_IDS.every((id) => isShareFormatId(SHARE_TEMPLATES[id].bestFor)));
ok('both modes exist so the feed is not a wall of one look',
  new Set(SHARE_TEMPLATE_IDS.map((id) => SHARE_TEMPLATES[id].palette.mode)).size === 2);
// Text contrast must survive the platform's re-compression: body text ≥ 4.5:1
// against its own background, and accent ink ≥ 4.5:1 on the accent fill.
const rgb = (hex) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const luminance = (hex) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
for (const id of SHARE_TEMPLATE_IDS) {
  const { palette, name } = SHARE_TEMPLATES[id];
  ok(`${name}: text on background ≥ 4.5:1`, contrast(palette.text, palette.background) >= 4.5);
  ok(`${name}: muted on background ≥ 3:1`, contrast(palette.muted, palette.background) >= 3);
  ok(`${name}: ink on accent ≥ 4.5:1`, contrast(palette.accentInk, palette.accent) >= 4.5);
  ok(`${name}: accent on background ≥ 3:1`, contrast(palette.accent, palette.background) >= 3);
  // The secondary data colour carries the dashes, stamps and unit labels, so it
  // has to survive on the background too (3:1 is the bar for non-body graphics).
  ok(`${name}: ink2 on background ≥ 3:1`, contrast(palette.ink2, palette.background) >= 3);
  // Every colour that paints a surface must differ from the background, or the
  // gradient is invisible and the card goes back to being a flat rectangle.
  ok(`${name}: gradient deep differs from background`, palette.deep.toLowerCase() !== palette.background.toLowerCase());
  ok(`${name}: gradient glow differs from background`, palette.glow.toLowerCase() !== palette.background.toLowerCase());
  ok(`${name}: surface is a visible step from background`, contrast(palette.surface, palette.background) >= 1.04);
  // The colour block is the composition's second tone; if it matches the
  // background the calendar floats in a void instead of sitting in a panel.
  ok(`${name}: colour block is defined`, typeof palette.block === 'string' && palette.block.length > 3);
  ok(`${name}: colour block is not the background`, palette.block.toLowerCase() !== palette.background.toLowerCase());
}

// ── Hero + data rows: the two new layout inputs ──────────────────────────
const liveHero = shareHero(stats({ streak: streak(12, 20), coverage: { logged: 6, days: 7 }, burn: burn(2100, 40) }));
eq('hero prefers the live streak', liveHero, { value: '12', label: 'day streak' });
const coveredHero = shareHero(stats({ coverage: { logged: 4, days: 7 } }));
eq('hero falls back to coverage', coveredHero, { value: '4', label: 'days logged' });
const burnHero = shareHero(stats({ burn: burn(2140, 8) }));
eq('hero falls back to measured burn', burnHero, { value: '2,140', label: 'kcal measured burn' });
const deadHero = shareHero(stats({ streak: streak(0, 0), coverage: { logged: 0, days: 7 } }));
eq('hero never invents a number', deadHero.value, '—');

const fullRows = shareRows(stats({ streak: streak(9, 9), coverage: { logged: 7, days: 7 }, burn: burn(2100, 45) }));
eq('rows list days logged', fullRows[0], { label: 'days logged', value: '7/7' });
eq('rows list the streak', fullRows[1], { label: 'streak', value: '9 d' });
eq('rows carry measured burn', fullRows[2], { label: 'true burn', value: '2,100 kcal' });
eq('rows carry drift only when it moved', fullRows[3], { label: 'drift', value: '+45 kcal/wk' });
ok('steady burn adds no drift row', shareRows(stats({ burn: burn(2100, 8) })).every((r) => r.label !== 'drift'));
ok('rows never invent a number', shareRows(stats({ coverage: { logged: 0, days: 0 } })).length === 0);
// Same behaviour rules as the card copy, applied to the new surfaces.
for (const [name, s] of [
  ['hero', null],
  ['rows', null],
]) {
  const text = `${shareHero(s ?? stats({ streak: streak(9, 9) })).label} ${shareRows(s ?? stats({ streak: streak(9, 9), coverage: { logged: 7, days: 7 } }))
    .map((r) => `${r.label} ${r.value}`)
    .join(' ')}`.toLowerCase();
  ok(`${name}: no weight/before-after framing`, !/weight|kg|lbs|before|after|body|bmi/.test(text));
}
// A hero + rows must be available whenever the card is eligible (the layouts
// read them unconditionally).
const eligible = buildShareCard(stats({ coverage: { logged: 3, days: 7 } }));
ok('eligible card always carries a hero and rows',
  eligible.eligible === true && typeof eligible.hero.value === 'string' && Array.isArray(eligible.rows));
ok('ineligible card carries neither', buildShareCard(stats()).eligible === false);

// ── The achievement idiom (medal / goal cards) ──────────────────────────────
// The medal is a claim, so the claim has to be honest: metal is earned, and the
// stamp never announces a record that was not set.
const medalCard = buildShareCard(stats({ streak: streak(12, 20), coverage: { logged: 6, days: 7 } }));
ok('achievement cards carry the full chrome payload',
  medalCard.eligible === true &&
    typeof medalCard.eyebrow === 'string' &&
    medalCard.achievement.tone === 'gold' &&
    typeof medalCard.status.label === 'string' &&
    typeof medalCard.best.value === 'string' &&
    typeof medalCard.progress.pct === 'number');
ok('a live run names the behaviour, not the body',
  medalCard.eligible && medalCard.achievement.title.toLowerCase() === 'streak keeper' && medalCard.achievement.subtitle === '12 days');
ok('a run behind the record is not stamped as a record',
  medalCard.eligible && medalCard.status.label.toLowerCase() === 'on track');
ok('the run to beat is the best, not the current', medalCard.eligible && medalCard.best.value === '20 d');
ok('a completed goal is the only "goal met"',
  buildShareCard(stats({ coverage: { logged: 7, days: 7 } })).status.label.toLowerCase() === 'goal met!');
ok('a tied record counts as best yet',
  buildShareCard(stats({ streak: streak(20, 20) })).status.label.toLowerCase() === 'best yet');
ok('an ended run earns silver, not gold',
  buildShareCard(stats({ streak: streak(0, 20) })).achievement.tone === 'silver');
ok('a week with no run earns bronze',
  buildShareCard(stats({ coverage: { logged: 3, days: 7 } })).achievement.tone === 'bronze');
ok('a measurement-only week is accent, not metal',
  buildShareCard(stats({ burn: burn(2200, 20) })).achievement.tone === 'accent');
ok('eyebrow names the surface',
  shareEyebrow(stats({ streak: streak(4, 4) })) === 'Logging streak' &&
    shareEyebrow(stats({ coverage: { logged: 2, days: 5 } })) === 'Weekly coverage' &&
    shareEyebrow(stats({ burn: burn(2200, 20) })) === 'Measured burn');
ok('no best run is a dash, never a zero', shareBestRow(stats()).value === '—');
// The progress track is drawn from pct, so a bad data day must not be able to
// draw a bar past its own track.
const overflow = shareProgress(stats({ coverage: { logged: 9, days: 7 } }));
ok('progress is clamped to the track', overflow.pct <= 1 && overflow.value === '7');
ok('progress with no target is zero, not NaN', shareProgress(stats({ coverage: { logged: 0, days: 0 } })).pct === 0);
ok('progress reports the goal it is tracking',
  shareProgress(stats({ coverage: { logged: 4, days: 7 } })).label === 'Days logged');

// Arc text: the medal's arched name. Geometry, not vibes — a mirrored or
// overlapping arc reads as a broken medal and no screenshot catches it.
const arcTop = arcGlyphs({ text: 'STREAK KEEPER', cx: 100, cy: 100, radius: 60, stepDeg: 9 });
ok('arc keeps every character', arcTop.length === 'STREAK KEEPER'.length);
ok('arc advances left to right', arcTop.every((g, i) => i === 0 || g.x > arcTop[i - 1].x));
ok('arc rises above its centre', arcTop.every((g) => g.y < 100));
ok('arc rotation stays upright near the top', arcTop.every((g) => Math.abs(g.rotate) < 80));
ok('arc stays on its radius', arcTop.every((g) => Math.abs(Math.hypot(g.x - 100, g.y - 100) - 60) < 0.2));
const arcBottom = arcGlyphs({ text: '12 DAYS', cx: 100, cy: 100, radius: 60, stepDeg: 9, centerDeg: 180 });
ok('bottom arc sits below its centre', arcBottom.every((g) => g.y > 100));
// It has to read left-to-right like every other line of text. Laid out the same
// way round as the top arc it renders mirrored: "12 DAYS" → "SYAD 21".
ok('bottom arc reads in the same order', arcBottom.every((g, i) => i === 0 || g.x > arcBottom[i - 1].x));
ok('bottom arc stands upright', arcBottom.every((g) => Math.abs(g.rotate) < 80));
ok('bottom arc leans into the valley',
  arcBottom[0].rotate > 0 && arcBottom[arcBottom.length - 1].rotate < 0);
ok('top arc leans into the rainbow',
  arcTop[0].rotate < 0 && arcTop[arcTop.length - 1].rotate > 0);
ok('a one-character arc has no offset', arcGlyphs({ text: 'X', cx: 50, cy: 50, radius: 20, stepDeg: 9 })[0].x === 50);

/*
 * Arc spacing has to be solved from the geometry, not guessed from the string
 * length. Each glyph carries its own rotation, so its painted box is a turned
 * rectangle: two neighbours (centres `s` apart along the arc) miss each other
 * exactly when s ≥ advance·cos(Δ/2) + ink·sin(Δ/2). A fixed step ignores the
 * rotation term, which is why a 9° step that is generous on a 180px medallion
 * put "100 DAYS"'s second zero on top of its first at 109px.
 */
const GLYPH_ADVANCE_EM = 0.82;
const GLYPH_INK_EM = 0.88;

/** True when two neighbouring glyph boxes of a fitted arc share pixels. */
function arcCollides(glyphs, radius, fontSize) {
  const advance = GLYPH_ADVANCE_EM * fontSize;
  const ink = GLYPH_INK_EM * fontSize;
  for (let i = 1; i < glyphs.length; i += 1) {
    const a = glyphs[i - 1];
    const b = glyphs[i];
    if (a.char === ' ' || b.char === ' ') continue;
    const s = Math.hypot(b.x - a.x, b.y - a.y);
    const turn = (Math.abs(b.rotate - a.rotate) * Math.PI) / 180 / 2;
    if (s < advance * Math.cos(turn) + ink * Math.sin(turn)) return true;
  }
  return false;
}

const arcCases = [
  { text: '100 DAYS', radius: 35, fontSize: 8.175, sweep: 120 },
  { text: 'STREAK KEEPER', radius: 45.4, fontSize: 8.38, sweep: 150 },
  { text: 'MEASURED ON DEVICE', radius: 35, fontSize: 8.175, sweep: 120 },
  { text: '12 DAYS', radius: 24, fontSize: 7, sweep: 120 },
  { text: 'GOAL MET!', radius: 52, fontSize: 11, sweep: 150 },
];
let arcCollisions = 0;
let arcOverBudget = 0;
for (const c of arcCases) {
  const fit = fitArc({ text: c.text, radius: c.radius, fontSize: c.fontSize, maxSweepDeg: c.sweep });
  const glyphs = arcGlyphs({
    text: c.text,
    cx: 0,
    cy: 0,
    radius: c.radius,
    stepDeg: fit.stepDeg,
    centerDeg: 180,
  });
  if (arcCollides(glyphs, c.radius, fit.fontSize)) arcCollisions += 1;
  // A wider arc is the preferred fix, so the budget is only broken once the
  // type has already come down to its 5px floor and still cannot be spaced.
  if (fit.sweepDeg > c.sweep + 0.01 && fit.fontSize > 5) arcOverBudget += 1;
}
ok('no fitted arc puts two glyphs on top of each other', arcCollisions === 0);
ok('a fitted arc only exceeds its sweep budget once the type is at the floor', arcOverBudget === 0);
ok('the fitted step grows as the radius shrinks',
  arcStepFor(30, 9) > arcStepFor(60, 9));
ok('the fitted step grows with the type', arcStepFor(40, 12) > arcStepFor(40, 8));
ok('an 11° step still collides on a small medallion',
  arcStepFor(35, 9) > 11);
ok('a fitted arc never shrinks type it was not asked to shrink',
  fitArc({ text: 'GOAL MET', radius: 60, fontSize: 10, maxSweepDeg: 150 }).fontSize === 10);

// The date the achievement is claimed for. Built from tables, not Intl: the
// capture runs on Hermes, which ships without full ICU on Android.
ok('date label reads as a date', shareDateLabel(new Date(2026, 8, 20)) === 'Sunday 20 Sept');
ok('date label handles a single-digit day', shareDateLabel(new Date(2026, 0, 3)) === 'Saturday 3 Jan');
ok('date label handles the last day of a month', shareDateLabel(new Date(2026, 11, 31)) === 'Thursday 31 Dec');
ok('date label never returns an empty string',
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].every((m) => shareDateLabel(new Date(2026, m, 15)).length > 6));

// ---------------------------------------------------------------------------
// Decor layers
//
// A card's background is built from full-canvas layers (mesh, grain, scanlines,
// rings) stacked inside one absolutely-positioned wrapper. On native those keep
// their own height; on web they are bare <svg> elements, so they inherit the
// browser's default `flex-shrink: 1` and the flex container squashes them to
// 1/N of the card. Measured once: two layers on a 450px card each laid out at
// 225px, which draws the gradient on the top half and the grain on the bottom
// half. It reads as "the design looks flat", not as a bug, so it needs a test.
//
// These assertions are source-level on purpose: the failure mode is CSS layout,
// which no pure-function test can see, and the share lab's runtime probe is the
// only other instrument (web only).
const DECOR_LAYERS = {
  '../src/components/share-card.tsx': ['Mesh', 'Grain', 'Rings', 'Scanlines'],
  '../src/components/daily-share-card.tsx': ['Mesh', 'Grain'],
};

/** The source of one top-level `function name(...)` body. */
function functionSource(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) return null;
  const next = src.indexOf('\nfunction ', start + 1);
  return src.slice(start, next < 0 ? src.length : next);
}

ok('decor layers are taken out of flex flow', SHARE_DECOR_LAYER_STYLE.position === 'absolute');
ok(
  'the decor layer style pins to the top-left corner',
  SHARE_DECOR_LAYER_STYLE.top === 0 && SHARE_DECOR_LAYER_STYLE.left === 0,
);

for (const [file, layers] of Object.entries(DECOR_LAYERS)) {
  const src = readFileSync(new URL(file, import.meta.url), 'utf8');
  // The lab finds decor by this id prefix to measure layer coverage.
  ok(`${file} tags its decor wrapper for the share lab`, /nativeID={\s*`?sharecard-decor/.test(src));
  for (const layer of layers) {
    const body = functionSource(src, layer);
    ok(
      `${layer} in ${file} cannot be squashed by the flex layout`,
      body != null && body.includes('SHARE_DECOR_LAYER_STYLE'),
    );
  }
}


// ---------------------------------------------------------------------------
// The footer strip must not repeat the medal
//
// The medal arches the achievement across the disc. A record that has ended is
// struck in silver as "Best run · 30 days", and the strip used to print "BEST
// RUN 30 d" underneath it — the same fact twice on one image, which is the
// fastest way to make a card look auto-generated. The strip falls back to the
// week's coverage only when the medal has taken the record.
// ---------------------------------------------------------------------------
const RUNNING = { title: 'Streak keeper', subtitle: '12 days', tone: 'gold' };
const ENDED = { title: 'Best run', subtitle: '30 days', tone: 'silver' };
const WEEK = { title: 'Steady week', subtitle: '3/7 days', tone: 'bronze' };
const RECORD_ROW = { label: 'best run', value: '30 d' };
const COVERAGE_ROW = { label: 'Days logged', value: '1', target: '7', pct: 1 / 7 };

eq('a live run keeps the record in the strip', shareStripRow(RUNNING, RECORD_ROW, COVERAGE_ROW), RECORD_ROW);
eq('a bronze week keeps the record in the strip', shareStripRow(WEEK, RECORD_ROW, COVERAGE_ROW), RECORD_ROW);
eq('an ended record hands the strip to coverage', shareStripRow(ENDED, RECORD_ROW, COVERAGE_ROW), {
  label: 'Days logged',
  value: '1/7',
});
// Without coverage there is nothing else to say, so the record stays.
eq('no coverage to fall back on keeps the record', shareStripRow(ENDED, RECORD_ROW, undefined), RECORD_ROW);
eq('a zero-day target keeps the record', shareStripRow(ENDED, RECORD_ROW, { label: 'Days logged', value: '0', target: '0', pct: 0 }), RECORD_ROW);
// The strip is never allowed to invent a second number than the one archived.
ok(
  'the strip never repeats the medal value',
  (() => {
    const strip = shareStripRow(ENDED, RECORD_ROW, COVERAGE_ROW);
    return !strip.value.includes(ENDED.subtitle.split(' ')[0]);
  })(),
);

console.log(fails === 0 ? '\nAll share-card checks passed.' : `\n${fails} share-card check(s) FAILED.`);
process.exit(fails === 0 ? 0 : 1);
