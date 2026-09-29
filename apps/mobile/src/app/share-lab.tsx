/**
 * Share-card lab — every example the app can actually produce, on one screen,
 * at a size you can judge. Dev only (`__DEV__`), never shipped.
 *
 * Two things make this worth having:
 *
 * 1. **The examples are real.** Every card here is built by the same
 *    `buildShareCard` / `buildDailyCard` the share path calls, fed realistic
 *    stats (a live 12-day run, a 100-day milestone, a run that just ended, a
 *    day with no logs, an over-budget day). Nothing is hand-written copy that
 *    the app would never print — a lab full of plausible-looking fake data is
 *    how you ship a design that breaks on a real week.
 *
 * 2. **It measures fit.** Layout is the one thing the eye forgives and the
 *    capture does not: a card is a fixed box with `overflow: hidden`, so
 *    content 60 px too tall still looks fine on screen and then posts without
 *    its QR code. On web the lab measures every rendered card's content against
 *    the card's own edges — bottom overflow, side overflow, and text that was
 *    silently cut to an ellipsis — and badges each one. Measurement is scoped
 *    per example, so a payload that breaks one look is named, not averaged away.
 *
 * `/share-lab?moment=hundred-day&template=medal&format=story` isolates one card
 * edge-to-edge; `?daily=over-day&format=square` does the same for the recap.
 */

import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { DailyShareCardPreview } from '@/components/daily-share-card';
import { ShareCardPreview, type ShareCardData } from '@/components/share-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { buildDailyCard, type DailyStats } from '@/lib/share-daily';
import { buildShareCard, type ShareStats } from '@/lib/share-card';
import { weekPips } from '@/lib/streak';
import type { BurnTrend } from '@/lib/trends';
import {
  DEFAULT_SHARE_TEMPLATE,
  SHARE_FORMATS,
  SHARE_FORMAT_IDS,
  SHARE_TEMPLATES,
  SHARE_TEMPLATE_IDS,
  isShareFormatId,
  isShareTemplateId,
  shareCardSize,
  type ShareFormatId,
  type ShareTemplateId,
} from '@/lib/share-templates';

/* ------------------------------------------------------------------ *
 * Examples
 * ------------------------------------------------------------------ */

/** A streak state with the claimed-day fields a running streak would carry. */
function streakOf(current: number, best: number): ShareStats['streak'] {
  return {
    current,
    best,
    lastClaimedAt: current > 0 ? '2026-09-20T08:10:00.000Z' : null,
    lastClaimedDayKey: current > 0 ? '2026-09-20' : null,
  };
}

function burnOf(latest: number, driftPerWeek: number | null): BurnTrend {
  return {
    latest,
    avg: Math.round((latest * 0.92 + latest) / 2),
    min: latest - 96,
    max: latest + 74,
    driftPerWeek,
  };
}

type Moment = {
  id: string;
  name: string;
  /** Why this moment is in the gallery — usually the way it stresses a layout. */
  note: string;
  stats: ShareStats;
  dateLabel: string;
  macros?: ShareCardData['macros'];
};

/**
 * Ordered by what they teach. The first is the primary sample for the full
 * grid below; the rest exist because they are the shapes that break things —
 * three-digit heroes, no live run at all, a five-character measured burn, a day
 * with nothing in it.
 */
const MOMENTS: Moment[] = [
  {
    id: 'twelve-day',
    name: 'Twelve-day run',
    note: 'The ordinary good week: a live run, a measured burn, macros logged. This is the card most users would post.',
    stats: { streak: streakOf(12, 12), coverage: { logged: 7, days: 7 }, burn: burnOf(2140, 45) },
    dateLabel: 'Sunday 20 Sept',
    macros: [
      { label: 'protein', value: 158, target: 165 },
      { label: 'carbs', value: 210, target: 240 },
      { label: 'fat', value: 58, target: 70 },
    ],
  },
  {
    id: 'hundred-day',
    name: '100-day milestone',
    note: 'A three-digit hero. Display type that fits "12" crowds the frame at "100", and the achievement line has to bend around a wider number.',
    stats: { streak: streakOf(100, 100), coverage: { logged: 7, days: 7 }, burn: burnOf(2310, 90) },
    dateLabel: 'Friday 18 Sept',
    macros: [
      { label: 'protein', value: 172, target: 175 },
      { label: 'carbs', value: 236, target: 240 },
      { label: 'fat', value: 66, target: 70 },
    ],
  },
  {
    id: 'perfect-week',
    name: 'Perfect week',
    note: 'Nothing missed, so the stamp reads "Goal met!" and the track is full. The one state with no room for an encouraging half-measure.',
    stats: { streak: streakOf(22, 22), coverage: { logged: 7, days: 7 }, burn: burnOf(2196, 12) },
    dateLabel: 'Monday 21 Sept',
    macros: [
      { label: 'protein', value: 169, target: 170 },
      { label: 'carbs', value: 238, target: 240 },
      { label: 'fat', value: 69, target: 70 },
    ],
  },
  {
    id: 'day-two',
    name: 'Day two',
    note: 'The most common card at launch and the easiest to break: almost no history, so the hero is small and everything else has to carry the composition.',
    stats: { streak: streakOf(2, 2), coverage: { logged: 2, days: 7 }, burn: null },
    dateLabel: 'Tuesday 22 Sept',
  },
  {
    id: 'first-week',
    name: 'First honest week',
    note: 'No True Burn yet (it needs history), so there is no measurement to lean on — just coverage and a run. Bronze, and it should look earned rather than empty.',
    stats: { streak: streakOf(3, 3), coverage: { logged: 3, days: 7 }, burn: null },
    dateLabel: 'Wednesday 23 Sept',
  },
  {
    id: 'run-ended',
    name: 'Run just ended',
    note: 'The silver case. The best run is in the past and the calendar has gaps, so the card has to celebrate a record without claiming one today.',
    stats: { streak: streakOf(0, 22), coverage: { logged: 3, days: 7 }, burn: burnOf(2088, -38) },
    dateLabel: 'Thursday 24 Sept',
  },
  {
    id: 'measured-only',
    name: 'Measured, nothing logged',
    note: 'A user who wears the tracker but has not logged food for a week. The hero becomes the measured burn — five characters plus a comma, the longest number the card ever prints.',
    stats: { streak: streakOf(0, 0), coverage: { logged: 0, days: 7 }, burn: burnOf(2285, 18) },
    dateLabel: 'Friday 25 Sept',
  },
  {
    id: 'drifting',
    name: 'Burn drifting down',
    note: 'A negative drift row with a minus sign, which is the only metric on the card that is ever negative.',
    stats: { streak: streakOf(45, 45), coverage: { logged: 6, days: 7 }, burn: burnOf(2015, -122) },
    dateLabel: 'Saturday 26 Sept',
    macros: [
      { label: 'protein', value: 142, target: 165 },
      { label: 'carbs', value: 186, target: 240 },
      { label: 'fat', value: 54, target: 70 },
    ],
  },
  {
    id: 'comeback',
    name: 'Restart after a break',
    note: 'One day back after a 30-day run ended. The card celebrates the record rather than shaming the reset — silver, and the headline is the old run, not the single day.',
    stats: { streak: streakOf(1, 30), coverage: { logged: 1, days: 7 }, burn: null },
    dateLabel: 'Sunday 27 Sept',
  },
  {
    id: 'year-run',
    name: '350-day run',
    note: 'The longest strings the medal ever has to bend: "Streak keeper" arched over "350 days", against a three-digit hero in display type.',
    stats: { streak: streakOf(350, 350), coverage: { logged: 7, days: 7 }, burn: burnOf(2412, -18) },
    dateLabel: 'Monday 28 Sept',
    macros: [
      { label: 'protein', value: 170, target: 175 },
      { label: 'carbs', value: 244, target: 250 },
      { label: 'fat', value: 68, target: 72 },
    ],
  },
  {
    id: 'surge',
    name: 'Burn surging up',
    note: 'The longest number the data rows ever print: a four-digit drift ("+1,180 kcal/wk") beside a four-digit measured burn, where every other row is three.',
    stats: { streak: streakOf(18, 18), coverage: { logged: 7, days: 7 }, burn: burnOf(2684, 1180) },
    dateLabel: 'Tuesday 29 Sept',
    macros: [
      { label: 'protein', value: 188, target: 170 },
      { label: 'carbs', value: 268, target: 250 },
      { label: 'fat', value: 82, target: 74 },
    ],
  },
  {
    id: 'new-best',
    name: 'A record, not a perfect week',
    note: 'The only state that prints "Best yet" instead of "Goal met!": a run sitting at its own record with gaps still in the week. Two honest claims, one stamp.',
    stats: { streak: streakOf(23, 23), coverage: { logged: 5, days: 7 }, burn: burnOf(2264, 34) },
    dateLabel: 'Wednesday 30 Sept',
    macros: [
      { label: 'protein', value: 149, target: 170 },
      { label: 'carbs', value: 208, target: 250 },
      { label: 'fat', value: 61, target: 74 },
    ],
  },
  {
    id: 'macros-over',
    name: 'Every macro over target',
    note: 'All three rings past 100%: the ring fills to its cap and the label has to print a number bigger than it can draw. The one shape where the Goal card stops being encouraging.',
    stats: { streak: streakOf(9, 9), coverage: { logged: 7, days: 7 }, burn: burnOf(2390, 76) },
    dateLabel: 'Thursday 1 Oct',
    macros: [
      { label: 'protein', value: 214, target: 165 },
      { label: 'carbs', value: 302, target: 240 },
      { label: 'fat', value: 96, target: 70 },
    ],
  },
  {
    id: 'run-no-data',
    name: 'Live run, nothing else',
    note: 'The layout with the least to say: a gold run, no True Burn yet and no macros, so there is no chart, no drift row and no rings — the composition has to hold on the medal alone.',
    stats: { streak: streakOf(6, 6), coverage: { logged: 6, days: 7 }, burn: null },
    dateLabel: 'Friday 2 Oct',
  },
];

/**
 * The trailing window as a calendar, derived from the numbers the card claims.
 *
 * A streak is a *trailing* fact, so the run has to sit at the right-hand end
 * and every other logged day has to fall behind it. Deriving the grid instead
 * of hand-placing it is what stops the card printing "6/7 logged" over a
 * calendar with seven lit days — the two claims have to come from one source.
 */
function calendarFor(coverage: { logged: number; days: number }, current: number): boolean[] {
  const total = Math.max(7, coverage.days);
  const claimed = Math.max(0, Math.min(coverage.logged, total));
  // A run longer than the window would light every day, contradicting the
  // claimed count; the count wins, because it is the number on the card.
  const tail = Math.min(Math.max(0, current), claimed);
  const lit = new Array<boolean>(total).fill(false);
  for (let i = total - tail; i < total; i += 1) lit[i] = true;

  let left = claimed - tail;
  const gaps = total - tail;
  // Spread the rest through the gaps before the run, oldest first.
  for (let i = 0; left > 0 && i < gaps; i += 2) {
    lit[i] = true;
    left -= 1;
  }
  // Few gaps left (a long run) — fill forwards rather than drop the count.
  for (let i = 0; left > 0 && i < gaps; i += 1) {
    if (!lit[i]) {
      lit[i] = true;
      left -= 1;
    }
  }
  return lit;
}

/** The measured-burn line, ending at today's value. */
function burnSeries(burn: BurnTrend): number[] {
  const perDay = (burn.driftPerWeek ?? 0) / 7;
  const n = 10;
  return Array.from({ length: n }, (_, i) => Math.round(burn.latest - perDay * (n - 1 - i)));
}

/** Run a moment through the real card logic; null when the app wouldn't share it. */
function momentData(moment: Moment): ShareCardData | null {
  const decision = buildShareCard(moment.stats);
  if (!decision.eligible) return null;
  const burn = moment.stats.burn;
  return {
    ...decision,
    // The pip row is the streak's own count, exactly as Home builds it; the
    // window count lives on `loggedDays`. They are different questions and the
    // card labels them differently, so one must not be derived from the other.
    litDays: weekPips(moment.stats.streak.current),
    loggedDays: calendarFor(moment.stats.coverage, moment.stats.streak.current),
    burnPoints: burn ? burnSeries(burn) : undefined,
    burnEst: burn ? burn.avg : undefined,
    macros: moment.macros,
    dateLabel: moment.dateLabel,
  };
}

const MOMENT_CARDS = MOMENTS.map((moment) => ({ moment, data: momentData(moment) }));

/** The full grid below renders the richest moment. */
const PRIMARY = MOMENT_CARDS[0]!;

/* ------------------------------------------------------------------ *
 * Daily recap examples
 * ------------------------------------------------------------------ */

type DailyScenario = { id: string; name: string; note: string; stats: DailyStats };

const DAILY_SCENARIOS: DailyScenario[] = [
  {
    id: 'goal-met',
    name: 'Closed the day under target',
    note: 'The ordinary good day. The bar IS the equation: the track is goal + train, the fill is food.',
    stats: { targetKcal: 2100, foodKcal: 2040, workoutKcal: 0, measuredBurnKcal: 2100, usedMeasuredTarget: false },
  },
  {
    id: 'train-day',
    name: 'Trained, so the budget grew',
    note: 'A fourth equation row: Train raises what you can eat but never raises True Burn. Worth seeing that the row appears at all.',
    stats: { targetKcal: 2100, foodKcal: 2480, workoutKcal: 420, measuredBurnKcal: 2100, usedMeasuredTarget: false },
  },
  {
    id: 'over-day',
    name: 'Over budget',
    note: 'The card has to state the overshoot without scolding — the figure flips from "left" to "over" and the note stays factual.',
    stats: { targetKcal: 2100, foodKcal: 2610, workoutKcal: 0, measuredBurnKcal: 2100, usedMeasuredTarget: false },
  },
  {
    id: 'measured-target',
    name: 'Target from measured burn',
    note: 'True Burn adopted, so the goal itself came from the user\'s own data rather than the formula.',
    stats: { targetKcal: 2410, foodKcal: 2200, workoutKcal: 0, measuredBurnKcal: 2410, usedMeasuredTarget: true },
  },
  {
    id: 'trained-no-food',
    name: 'Trained, ate nothing logged',
    note: 'A train session and no food logged at all. The budget grows and almost all of it is left — the one case where a signed zero could reach the card as "−0".',
    stats: { targetKcal: 2100, foodKcal: 0, workoutKcal: 420, measuredBurnKcal: 2100, usedMeasuredTarget: false },
  },
  {
    id: 'exact-day',
    name: 'Went to bed on exactly zero',
    note: 'The boundary: food lands on the budget to the kcal. "0 left" has to read as a good day rather than an empty one.',
    stats: { targetKcal: 2100, foodKcal: 2100, workoutKcal: 0, measuredBurnKcal: 2100, usedMeasuredTarget: false },
  },
  {
    id: 'tiny-day',
    name: 'Barely logged',
    note: 'One small entry and nothing else, so the bar sits at a sliver and the hero is its largest relative number. An honest recap of a day the user nearly skipped.',
    stats: { targetKcal: 2100, foodKcal: 380, workoutKcal: 0, measuredBurnKcal: 2100, usedMeasuredTarget: false },
  },
  {
    id: 'blowout',
    name: 'A big day, and a big session',
    note: 'The widest the equation ever gets: four rows including train, two four-digit figures, and an overshoot past 1,000 kcal — stated, not scolded.',
    stats: { targetKcal: 2410, foodKcal: 3820, workoutKcal: 620, measuredBurnKcal: 2410, usedMeasuredTarget: true },
  },
  {
    id: 'formula-target',
    name: 'Before True Burn is ready',
    note: 'Logged, but the app has not measured the user yet — the goal is still the formula and the note must not imply a measurement that does not exist.',
    stats: { targetKcal: 1980, foodKcal: 1620, workoutKcal: 0, measuredBurnKcal: null, usedMeasuredTarget: false },
  },
];

const DAILY_CARDS = DAILY_SCENARIOS.map((scenario) => ({ scenario, decision: buildDailyCard(scenario.stats) }));

/** The measurement scope a card sits in — see `parseCardId`. */
const GRID_SCOPE = 'grid';
const momentScope = (id: string) => `moment:${id}`;
const dailyScope = (id: string) => `daily:${id}`;

/* ------------------------------------------------------------------ *
 * Fit measurement
 * ------------------------------------------------------------------ */

/**
 * How a rendered card identifies itself: card roots carry
 * `nativeID="sharecard-<format>-<template>"` (the daily card uses
 * `sharecard-daily-<format>`).
 *
 * The example a card belongs to is the nearest ancestor marked `sharescope-*`,
 * read at the call site. Both halves matter: without the scope, a hundred-day
 * milestone that overflows would be reported against the twelve-day card, and
 * the badge would be pointing at the wrong thing.
 */
function parseCardId(id: string): { format: ShareFormatId; cardKey: string } | null {
  const [, a, b] = id.split('-');
  if (!a || !b) return null;
  if (a === 'daily') {
    if (!isShareFormatId(b)) return null;
    return { format: b, cardKey: `daily/${b}` };
  }
  if (!isShareFormatId(a) || !isShareTemplateId(b)) return null;
  return { format: a, cardKey: `${a}/${b}` };
}

const fitKey = (scope: string, format: ShareFormatId, template: ShareTemplateId) =>
  `${scope}·${format}/${template}`;
const dailyFitKey = (scope: string, format: ShareFormatId) => `${scope}·daily/${format}`;

/** 1 dp of layout noise is not an overflow worth chasing. */
const FIT_TOLERANCE_PX = 2;

type FitIssue = {
  /** px the content runs past the bottom edge (the capture crops it). */
  down: number;
  /** px the content runs past a side edge. */
  side: number;
  /** Leaf text nodes whose content does not fit their own box ("2,140…"). */
  truncated: number;
  /**
   * Decor layers (mesh, grain, scanlines, rings) that do not cover the whole
   * card. Always zero on native, where flex items keep their own height — this
   * exists because on web they are squashed to 1/N of the card and the only
   * symptom is that the design looks flat.
   */
  layers: number;
  /**
   * Pairs of *separate* strings drawn on top of each other.
   *
   * Every other metric here is blind to this: each string fits its own box (so
   * nothing is ellipsized) and the card still fits its frame (so nothing is
   * clipped) — the card just reads as broken. That is the failure that looks
   * like "the spacing is wrong" to a human, so it gets its own count.
   */
  overlaps: number;
  /** One offending pair, for the punch list (`"12" ∩ "DAY STREAK"`). */
  overlapSample: string;
};

type FitReport = Map<string, FitIssue>;

const EMPTY_ISSUE: FitIssue = { down: 0, side: 0, truncated: 0, layers: 0, overlaps: 0, overlapSample: '' };

const isClean = (issue: FitIssue | undefined) =>
  !issue ||
  (issue.down < 2 && issue.side < 2 && issue.truncated === 0 && issue.layers === 0 && issue.overlaps === 0);

type Pt = { x: number; y: number };
type Quad = [Pt, Pt, Pt, Pt];

let leafCanvas: HTMLCanvasElement | null | undefined;
const glyphContext = () => {
  if (leafCanvas === undefined) {
    leafCanvas = typeof document === 'undefined' ? null : document.createElement('canvas');
  }
  return leafCanvas?.getContext('2d') ?? null;
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The box a glyph actually paints, in screen px.
 *
 * An arc glyph's *layout* box is not its ink: the em box carries a full line's
 * leading above the capitals and its anchor sits mid-em, so two letters that
 * visually clear each other still report as overlapping — and, worse, the
 * reverse is also true near a tight radius. Since a clipped arc is the whole
 * reason this probe exists, glyphs are measured as ink (`measureText`'s actual
 * bounding box) carried through their own rotation by `getScreenCTM`.
 *
 * Grown by a hair, so "just touching" counts as a collision: at 3× in a feed,
 * letters whose ink meets read as one smudge.
 */
function glyphQuad(node: Element): Quad | null {
  if (node.namespaceURI !== SVG_NS || node.tagName.toLowerCase() !== 'text') return null;
  const ctx = glyphContext();
  const ctm = (node as unknown as SVGGraphicsElement).getScreenCTM?.();
  if (!ctx || !ctm) return null;
  const style = getComputedStyle(node);
  ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const m = ctx.measureText(node.textContent ?? '');
  const x = Number(node.getAttribute('x') ?? 0);
  const y = Number(node.getAttribute('y') ?? 0);
  let l = x - m.actualBoundingBoxLeft;
  let r = x + m.actualBoundingBoxRight;
  let t = y - m.actualBoundingBoxAscent;
  let b = y + m.actualBoundingBoxDescent;
  const growX = (r - l) * 0.02;
  const growY = (b - t) * 0.02;
  l -= growX;
  r += growX;
  t -= growY;
  b += growY;
  return ([
    [l, t],
    [r, t],
    [r, b],
    [l, b],
  ] as [number, number][]).map(([px, py]) => ({
    x: ctm.a * px + ctm.c * py + ctm.e,
    y: ctm.b * px + ctm.d * py + ctm.f,
  })) as Quad;
}

const rectQuad = (r: { left: number; top: number; right: number; bottom: number }): Quad => [
  { x: r.left, y: r.top },
  { x: r.right, y: r.top },
  { x: r.right, y: r.bottom },
  { x: r.left, y: r.bottom },
];

/**
 * A layout `<Text>`'s box, trimmed to the string it paints.
 *
 * React Native text stretches to its column, so a two-character hero reports a
 * full-width box and "collides" with whatever is parked beside it — the stamp on
 * the paper card. Canvas metrics give the painted width, so a single line is
 * clamped to `min(box, text)` and anchored per `textAlign`; a wrapped paragraph
 * genuinely does fill its box and is left alone.
 */
function htmlQuad(node: HTMLElement, text: string, scale: number): Quad {
  const rect = node.getBoundingClientRect();
  const ctx = glyphContext();
  if (!ctx) return rectQuad(rect);
  const style = getComputedStyle(node);
  // A card is laid out at its base size and then scaled to the slot it sits in,
  // so computed styles are in base px while rects are in screen px. Comparing
  // the two directly measured "12" as 60px wide and left it unclamped — which
  // is exactly the false positive this clamp exists to remove. Work in base px
  // and come back out once.
  ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const painted = ctx.measureText(text).width;
  const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
  const boxBase = rect.width / scale;
  const heightBase = rect.height / scale;
  if (!Number.isFinite(painted) || painted <= 0) return rectQuad(rect);
  const w = Math.min(boxBase, painted + 2) * scale;
  // The box is also taller than the ink: a two-line `numberOfLines` box reserves
  // both lines even when the string fits on one, and that reserved space sat
  // under the paper card's stamp and reported a collision with nothing.
  const lines = Math.max(1, Math.ceil(painted / Math.max(1, boxBase)));
  const h = Math.min(heightBase, lines * line) * scale;
  const quad = (left: number) =>
    rectQuad({ left, top: rect.top, right: left + w, bottom: rect.top + h });
  if (style.textAlign === 'right' || style.textAlign === 'end') return quad(rect.right - w);
  if (style.textAlign === 'center') return quad(rect.left + (rect.width - w) / 2);
  return quad(rect.left);
}

/**
 * Every string on a card, as the polygons it paints — one per line of text.
 *
 * Deliberately restricted to leaves: a `<Text>` wrapping another `<Text>` is
 * one visible object and shares its parent's box, so comparing containers would
 * report every nested label as an overlap against its own wrapper. Two *leaves*
 * colliding, in contrast, has no correct interpretation.
 *
 * An element's box is still not its ink, though — hence `htmlQuad`, which trims
 * a single-line `<Text>` down to the width it actually paints.
 */
function cardLeaves(root: HTMLElement, scale: number): { quad: Quad; text: string }[] {
  const out: { quad: Quad; text: string }[] = [];
  root.querySelectorAll('*').forEach((node) => {
    if (node.children.length) return;
    const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    // Decoration is allowed to sit anywhere, including under content.
    if (node.closest('[id^="sharecard-decor"], [id^="sharecard-spill"]')) return;
    const style = getComputedStyle(node);
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return;
    if (node.getAttribute('aria-hidden') === 'true') return;
    const glyph = glyphQuad(node);
    if (glyph) {
      out.push({ quad: glyph, text });
      return;
    }
    const rect = node.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    out.push({ quad: htmlQuad(node as HTMLElement, text, scale), text });
  });
  return out;
}

/**
 * Separating-axis test on two convex quads: how deeply they share pixels.
 *
 * Returns the shallowest axis penetration in screen px (0 = clear). The depth,
 * rather than a yes/no, matters because layout rounding leaves neighbouring
 * line boxes overlapping by a fraction of a pixel — reporting that as a
 * collision would drown the real ones.
 */
function quadPenetration(a: Quad, b: Quad): number {
  let depth = Infinity;
  for (const quad of [a, b]) {
    for (const i of [0, 1]) {
      const ax = quad[i + 1]!.x - quad[i]!.x;
      const ay = quad[i + 1]!.y - quad[i]!.y;
      const len = Math.hypot(ax, ay);
      if (!len) continue;
      const ax1 = ax / len;
      const ay1 = ay / len;
      const pa = a.map((p) => p.x * ax1 + p.y * ay1);
      const pb = b.map((p) => p.x * ax1 + p.y * ay1);
      const gap = Math.min(
        Math.max(...pa) - Math.min(...pb),
        Math.max(...pb) - Math.min(...pa),
      );
      if (gap <= 0) return 0;
      depth = Math.min(depth, gap);
    }
  }
  return depth === Infinity ? 0 : depth;
}

/** Below this, two boxes touching is layout rounding rather than a mistake. */
const OVERLAP_TOLERANCE_BASE_PX = 1.5;

/** Short, readable name for a string in the punch list. */
const leafLabel = (text: string) => (text.length > 16 ? `"${text.slice(0, 15)}…"` : `"${text}"`);

/**
 * Measure, in base (layout) px, how far each rendered card's content spills past
 * the card's own edges.
 *
 * This is deliberately a *runtime measurement* rather than a unit test: font
 * metrics differ between web and native, so the only honest check that a card
 * fits is to lay it out and look. Descendants report their unclipped rect even
 * under `overflow: hidden`, which is exactly the content the capture would
 * throw away.
 *
 * Returns base px overshoot per `scope·format/template` (0 = fits). Native
 * returns an empty report: `onLayout` cannot see past a clipped parent, so on a
 * device the human eye is the instrument.
 */
function useFitReport(): FitReport {
  const [report, setReport] = useState<FitReport>(() => new Map());

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    let cancelled = false;

    const measure = () => {
      if (cancelled) return;
      const next: FitReport = new Map();
      document.querySelectorAll<HTMLElement>('[id^="sharecard-"]').forEach((el) => {
        const card = parseCardId(el.id);
        if (!card) return;
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const scale = rect.width / shareCardSize(card.format).baseWidth || 1;
        const scope =
          el.closest<HTMLElement>('[id^="sharescope-"]')?.id.replace('sharescope-', '') ?? GRID_SCOPE;

        let down = 0;
        let side = 0;
        let truncated = 0;
        let overlaps = 0;
        let overlapSample = '';

        // Decor layers are measured as *layers*, not as content: a full-canvas
        // mesh or grain must cover the card exactly. They used to be skipped
        // wholesale (their paths bleed off the frame on purpose), which made
        // this probe blind to the one bug it was best placed to catch — a layer
        // squashed by the flex layout, drawing the gradient on half the card.
        let layers = 0;
        // The background box is the card's own *direct child* (`Decor`). A
        // template may also nest a `sharecard-decor-*` box deeper in the content
        // — the medal's dashed arcs — where the whole point is to spill past the
        // edge. Measuring that one reports the intended bleed as a squashed
        // layer, so only the card's own box is a layer.
        [...el.children]
          .filter((c): c is HTMLElement => c instanceof HTMLElement && c.id.startsWith('sharecard-decor'))
          .forEach((wrap) => {
          wrap.querySelectorAll<HTMLElement>('svg').forEach((layer) => {
            const layerRect = layer.getBoundingClientRect();
            if (!layerRect.width || !layerRect.height) return;
            const covers =
              Math.abs(layerRect.width - rect.width) / scale <= FIT_TOLERANCE_PX &&
              Math.abs(layerRect.height - rect.height) / scale <= FIT_TOLERANCE_PX &&
              Math.abs(layerRect.top - rect.top) / scale <= FIT_TOLERANCE_PX &&
              Math.abs(layerRect.left - rect.left) / scale <= FIT_TOLERANCE_PX;
            if (!covers) layers += 1;
          });
        });

        el.querySelectorAll<HTMLElement>('*').forEach((child) => {
          // Decoration bleeds off the canvas on purpose (rings, glows,
          // watermarks, the medal's arcs), so only measure content. `Decor` and
          // `Spill` mark themselves with these id prefixes and the card clips
          // them. Reported overshoot is therefore always content the capture
          // would actually lose.
          if (child.closest('[id^="sharecard-decor"], [id^="sharecard-spill"]')) return;
          const childRect = child.getBoundingClientRect();
          if (!childRect.width || !childRect.height) return;
          down = Math.max(down, (childRect.bottom - rect.bottom) / scale);
          side = Math.max(side, (rect.left - childRect.left) / scale, (childRect.right - rect.right) / scale);
          // A leaf that scrolls is a leaf whose text was cut to an ellipsis:
          // the box is right, the string is not. Only detectable on web, and
          // exactly the class of bug a human eye reads as "looks fine".
          // Nodes that clip *themselves* on purpose (the leader dots filling a
          // row) are not truncation, so they are skipped.
          if (getComputedStyle(child).overflow === 'hidden') return;
          if (!child.children.length && child.textContent && child.scrollWidth > child.clientWidth + 1) truncated += 1;
        });

        // Two separate strings in the same square is a layout bug at any size
        // and in any template; nothing else on a card is compared this way, so
        // chips, rings and medals may still overlap their own contents freely.
        // Shapes, not boxes: a rotated glyph is compared as the parallelogram
        // it paints, which is the difference between "arc is tight" and "arc
        // has letters sitting on each other".
        const leaves = cardLeaves(el, scale);
        const tol = OVERLAP_TOLERANCE_BASE_PX * scale;
        for (let i = 0; i < leaves.length; i += 1) {
          for (let j = i + 1; j < leaves.length; j += 1) {
            if (quadPenetration(leaves[i]!.quad, leaves[j]!.quad) <= tol) continue;
            overlaps += 1;
            if (!overlapSample) {
              overlapSample = `${leafLabel(leaves[i]!.text)} ∩ ${leafLabel(leaves[j]!.text)}`;
            }
          }
        }

        const key = `${scope}·${card.cardKey}`;
        const prev = next.get(key) ?? EMPTY_ISSUE;
        // Several copies of a card can be mounted at once (preview + the
        // off-screen stage); keep the worst reading per key, since the copy that
        // overflows is the copy that ships.
        next.set(key, {
          down: Math.max(prev.down, down),
          side: Math.max(prev.side, side),
          truncated: Math.max(prev.truncated, truncated),
          layers: Math.max(prev.layers, layers),
          overlaps: Math.max(prev.overlaps, overlaps),
          overlapSample: prev.overlapSample || overlapSample,
        });
      });
      setReport(next);
    };

    // Two frames for layout, then once more after fonts settle — metrics move
    // when the webfont swaps in, and a false "fits" is worse than no report.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(measure);
    });
    const settle = setTimeout(measure, 700);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      clearTimeout(settle);
    };
  }, []);

  return report;
}

function FitBadge({ issue }: { issue: FitIssue | undefined }) {
  if (!issue) {
    return <Text style={[styles.badge, styles.badgeIdle]}>measuring…</Text>;
  }
  if (issue.overlaps > 0) {
    return <Text style={[styles.badge, styles.badgeBad]}>OVERLAP ×{issue.overlaps}</Text>;
  }
  if (issue.down >= FIT_TOLERANCE_PX || issue.side >= FIT_TOLERANCE_PX) {
    const axis = issue.down >= issue.side ? `↓${issue.down.toFixed(0)}px` : `↔${issue.side.toFixed(0)}px`;
    return <Text style={[styles.badge, styles.badgeBad]}>CLIPPED {axis}</Text>;
  }
  if (issue.layers > 0) {
    return <Text style={[styles.badge, styles.badgeBad]}>FLAT ×{issue.layers}</Text>;
  }
  if (issue.truncated > 0) {
    return <Text style={[styles.badge, styles.badgeWarn]}>TRUNCATED ×{issue.truncated}</Text>;
  }
  return <Text style={[styles.badge, styles.badgeOk]}>fits ✓</Text>;
}

/** Human label for a measurement scope, for the punch list. */
function scopeLabel(scope: string): string {
  if (scope === GRID_SCOPE) return 'Sample week (full grid)';
  const [kind, id] = scope.split(':');
  if (kind === 'moment') return MOMENTS.find((m) => m.id === id)?.name ?? id ?? scope;
  if (kind === 'daily') return DAILY_SCENARIOS.find((s) => s.id === id)?.name ?? id ?? scope;
  return scope;
}

function cardLabel(cardKey: string): string {
  const [format, template] = cardKey.split('/');
  const formatLabel = SHARE_FORMATS[format as ShareFormatId]?.label ?? format;
  const templateLabel = template === 'daily' ? 'Daily recap' : SHARE_TEMPLATES[template as ShareTemplateId]?.name ?? template;
  return `${formatLabel} · ${templateLabel}`;
}

export default function ShareLabScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ template?: string; format?: string; moment?: string; daily?: string; sparse?: string }>();
  const fit = useFitReport();

  const gutter = Spacing.four * 2;
  const twoUp = Math.floor((width - gutter - Spacing.three) / 2);

  // `?sparse=1` predates the moment gallery; keep it working.
  const momentId = params.sparse ? 'day-two' : params.moment;
  const isolatedMoment = MOMENT_CARDS.find(({ moment }) => moment.id === momentId);
  const isolatedDaily = DAILY_CARDS.find(({ scenario }) => scenario.id === params.daily);

  // Dev-only screen: a design gallery has no business in a shipped binary.
  // (Every hook above is called unconditionally, so the early return is safe.)
  if (!__DEV__) return <Redirect href="/home" />;

  const problems = [...fit.entries()]
    .filter(([, issue]) => !isClean(issue))
    .sort(
      (a, b) =>
        b[1].down + b[1].side + b[1].truncated + b[1].layers * 50 + b[1].overlaps * 100 -
        (a[1].down + a[1].side + a[1].truncated + a[1].layers * 50 + a[1].overlaps * 100),
    );

  const issueList =
    problems.length && fit.size ? (
      <View style={[styles.issues, { borderColor: theme.line }]}>
        <Text style={[styles.issueTitle, styles.badgeBad]}>
          {problems.length} of {fit.size} cards need work
        </Text>
        {problems.map(([key, issue]) => {
          const [scope, cardKey] = key.split('·');
          const detail = [
            issue.down >= FIT_TOLERANCE_PX ? `${issue.down.toFixed(0)}px past the bottom` : null,
            issue.side >= FIT_TOLERANCE_PX ? `${issue.side.toFixed(0)}px past a side edge` : null,
            issue.truncated ? `${issue.truncated} text node${issue.truncated === 1 ? '' : 's'} ellipsized` : null,
            issue.layers
              ? `${issue.layers} decor layer${issue.layers === 1 ? '' : 's'} not covering the card (mesh/grain squashed)`
              : null,
            issue.overlaps
              ? `${issue.overlaps} text collision${issue.overlaps === 1 ? '' : 's'}${issue.overlapSample ? ` (${issue.overlapSample})` : ''}`
              : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <Text key={key} style={[styles.issueRow, { color: theme.textSecondary }]}>
              {scopeLabel(scope!)} → {cardLabel(cardKey!)} · {detail}
            </Text>
          );
        })}
        <Text style={[styles.hint, { color: theme.muted }]}>
          Overflow is base px; multiply by 3 for the loss in the captured PNG. The footer (QR + site
          link) is the first thing off the card, and an ellipsized stat is how “2,140 kcal” becomes
          “2,14…”. FLAT means a background layer was stretched by the flex layout instead of covering
          the card — the gradient stops halfway down and reads as “flat design” rather than as a bug.
          OVERLAP counts separate strings sharing pixels: each one fits its own box and the card still
          fits its frame, so nothing else here would catch it. It is the failure that reads as
          “the spacing is wrong”.
        </Text>
      </View>
    ) : fit.size ? (
      <Text style={[styles.badge, styles.badgeOk, styles.allClear]}>
        all {fit.size} cards fit their frame, nothing collides
      </Text>
    ) : null;

  /* ---- Isolated view: one card, as large as the screen allows. ---- */

  if (isolatedDaily && isolatedDaily.decision.eligible) {
    const formatId = isShareFormatId(params.format) ? params.format : 'portrait';
    const format = SHARE_FORMATS[formatId];
    const size = shareCardSize(formatId);
    return (
      <ThemedView style={styles.screen}>
        <ScrollView contentContainerStyle={[styles.body, { paddingHorizontal: gutter / 2 }]} showsVerticalScrollIndicator={false}>
          <Text style={[styles.kicker, { color: theme.muted }]}>
            DAILY RECAP · {format.label.toUpperCase()} · {isolatedDaily.scenario.name.toUpperCase()}
          </Text>
          <FitBadge issue={fit.get(dailyFitKey(dailyScope(isolatedDaily.scenario.id), formatId))} />
          <View nativeID={`sharescope-${dailyScope(isolatedDaily.scenario.id)}`} style={styles.isolated}>
            <DailyShareCardPreview maxWidth={width - gutter} format={formatId} card={isolatedDaily.decision.card} />
          </View>
          <Text style={[styles.meta, { color: theme.muted }]}>
            {format.width}×{format.height}px · laid out {size.baseWidth}×{size.baseHeight} @{format.width / size.baseWidth}×
          </Text>
          <Text style={[styles.hint, { color: theme.textSecondary }]}>{isolatedDaily.scenario.note}</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>{format.hint}</Text>
        </ScrollView>
      </ThemedView>
    );
  }

  if (isShareTemplateId(params.template) || isShareFormatId(params.format) || isolatedMoment) {
    const templateId = isShareTemplateId(params.template) ? params.template : DEFAULT_SHARE_TEMPLATE;
    const formatId = isShareFormatId(params.format) ? params.format : SHARE_TEMPLATES[templateId].bestFor;
    const format = SHARE_FORMATS[formatId];
    const size = shareCardSize(formatId);
    const sample = isolatedMoment ?? PRIMARY;
    const scope = momentScope(sample.moment.id);
    return (
      <ThemedView style={styles.screen}>
        <ScrollView contentContainerStyle={[styles.body, { paddingHorizontal: gutter / 2 }]} showsVerticalScrollIndicator={false}>
          <Text style={[styles.kicker, { color: theme.muted }]}>
            {SHARE_TEMPLATES[templateId].name.toUpperCase()} · {format.label.toUpperCase()} ·{' '}
            {sample.moment.name.toUpperCase()}
          </Text>
          <FitBadge issue={fit.get(fitKey(scope, formatId, templateId))} />
          {sample.data ? (
            <View nativeID={`sharescope-${scope}`} style={styles.isolated}>
              <ShareCardPreview maxWidth={width - gutter} format={formatId} template={templateId} {...sample.data} />
            </View>
          ) : (
            <Text style={[styles.hint, { color: theme.textSecondary }]}>
              Nothing logged for this moment, so the app correctly refuses to build a card.
            </Text>
          )}
          <Text style={[styles.meta, { color: theme.muted }]}>
            {format.width}×{format.height}px · laid out {size.baseWidth}×{size.baseHeight} @{format.width / size.baseWidth}×
            {format.safeTopPx ? ` · story safe area ${format.safeTopPx}px top / ${format.safeBottomPx}px bottom` : ''}
          </Text>
          <Text style={[styles.hint, { color: theme.textSecondary }]}>{sample.moment.note}</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>{format.hint}</Text>
        </ScrollView>
      </ThemedView>
    );
  }

  /* ---- The gallery ---- */

  return (
    <ThemedView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={[styles.kicker, { color: theme.muted }]}>DEV ONLY · NOT SHIPPED</Text>
        <Text style={[styles.title, { color: theme.text }]}>Share card lab</Text>
        <ThemedText type="small" themeColor="textSecondary" style={styles.intro}>
          {MOMENTS.length} real moments × {SHARE_TEMPLATE_IDS.length} looks, plus {DAILY_SCENARIOS.length}{' '}
          daily recaps — every one built by the same code the share button calls. Isolate any card with{' '}
          <Text style={styles.code}>?moment=hundred-day&amp;template=medal&amp;format=story</Text> or{' '}
          <Text style={styles.code}>?daily=over-day&amp;format=square</Text>.
        </ThemedText>

        {issueList}

        {/*
          The flip-through: every example at the shape it would actually be
          posted in, at a size you can read. Not a second source of truth — the
          same `data` objects the exhaustive grid below uses, rendered at post
          size with the default look, so "what would my week look like" is one
          horizontal swipe instead of a scroll through sixteen combinations.
        */}
        <View style={styles.section}>
          <View style={[styles.sectionHead, { borderColor: theme.line }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              The post — {SHARE_TEMPLATES[DEFAULT_SHARE_TEMPLATE].name}, portrait ★
            </Text>
            <Text style={[styles.sectionMeta, { color: theme.muted }]}>
              {MOMENT_CARDS.filter(({ data }) => data).length} examples
            </Text>
          </View>
          <Text style={[styles.hint, { color: theme.muted }]}>
            Every moment in the default look, at the size it lands in a feed. Swipe for the rest —
            each one is a week a real user could have had.
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowScroll}>
            {MOMENT_CARDS.map(({ moment, data }) =>
              data ? (
                <View key={moment.id} style={{ gap: 6, alignItems: 'center' }}>
                  <ShareCardPreview maxWidth={264} format="portrait" template={DEFAULT_SHARE_TEMPLATE} {...data} />
                  <Text numberOfLines={1} style={[styles.cellLabel, { color: theme.text }]}>
                    {moment.name}
                  </Text>
                  <FitBadge
                    issue={fit.get(fitKey(momentScope(moment.id), 'portrait', DEFAULT_SHARE_TEMPLATE))}
                  />
                </View>
              ) : null,
            )}
          </ScrollView>
        </View>

        {MOMENT_CARDS.map(({ moment, data }) => (
          <View key={moment.id} nativeID={`sharescope-${momentScope(moment.id)}`} style={styles.section}>
            <View style={[styles.sectionHead, { borderColor: theme.line }]}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>{moment.name}</Text>
              <Text style={[styles.sectionMeta, { color: theme.muted }]}>
                {moment.stats.streak.current > 0 ? `${moment.stats.streak.current} d run` : 'no live run'} ·{' '}
                {moment.stats.coverage.logged}/{moment.stats.coverage.days} logged ·{' '}
                {moment.stats.burn ? `${Math.round(moment.stats.burn.latest).toLocaleString()} kcal measured` : 'no burn yet'}
              </Text>
            </View>
            <Text style={[styles.hint, { color: theme.muted }]}>{moment.note}</Text>
            {data ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowScroll}>
                {SHARE_TEMPLATE_IDS.map((templateId) => (
                  <View key={templateId} style={styles.cell}>
                    <ShareCardPreview maxWidth={190} format="portrait" template={templateId} {...data} />
                    <Text style={[styles.cellLabel, { color: theme.text }]}>
                      {SHARE_TEMPLATES[templateId].name}
                      {SHARE_TEMPLATES[templateId].bestFor === 'portrait' ? ' ★' : ''}
                    </Text>
                    <FitBadge issue={fit.get(fitKey(momentScope(moment.id), 'portrait', templateId))} />
                  </View>
                ))}
              </ScrollView>
            ) : (
              <Text style={[styles.hint, { color: theme.textSecondary }]}>
                Not shareable — a card with nothing on it is a nag, not a celebration.
              </Text>
            )}
          </View>
        ))}

        <View style={styles.section}>
          <View style={[styles.sectionHead, { borderColor: theme.line }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Daily recap</Text>
            <Text style={[styles.sectionMeta, { color: theme.muted }]}>
              portrait · {DAILY_SCENARIOS.length} days
            </Text>
          </View>
          <Text style={[styles.hint, { color: theme.muted }]}>
            The once-a-day card. Same measurement as the weekly ones — it is the newer card, so it is
            the less proven one.
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowScroll}>
            {DAILY_CARDS.map(({ scenario, decision }) =>
              decision.eligible ? (
                <View key={scenario.id} nativeID={`sharescope-${dailyScope(scenario.id)}`} style={styles.cell}>
                  <DailyShareCardPreview maxWidth={200} format="portrait" card={decision.card} />
                  <Text style={[styles.cellLabel, { color: theme.text }]}>{scenario.name}</Text>
                  <FitBadge issue={fit.get(dailyFitKey(dailyScope(scenario.id), 'portrait'))} />
                </View>
              ) : null,
            )}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <View style={[styles.sectionHead, { borderColor: theme.line }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Every look, every shape</Text>
            <Text style={[styles.sectionMeta, { color: theme.muted }]}>
              {SHARE_TEMPLATE_IDS.length} × {SHARE_FORMAT_IDS.length} · {PRIMARY.moment.name.toLowerCase()}
            </Text>
          </View>
          <Text style={[styles.hint, { color: theme.muted }]}>
            The same moment in all four shapes, which is how a look that only works at 9:16 gets
            caught before it hits an X preview.
          </Text>
        </View>

        {PRIMARY.data
          ? SHARE_FORMAT_IDS.map((formatId) => {
              const format = SHARE_FORMATS[formatId];
              const size = shareCardSize(formatId);
              return (
                <View key={formatId} style={styles.section}>
                  <View style={[styles.sectionHead, { borderColor: theme.line }]}>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>{format.label}</Text>
                    <Text style={[styles.sectionMeta, { color: theme.muted }]}>
                      {format.width}×{format.height}
                      {format.safeTopPx ? ` · safe ${format.safeTopPx}/${format.safeBottomPx}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.hint, { color: theme.muted }]}>{format.hint}</Text>
                  <View style={styles.row}>
                    {SHARE_TEMPLATE_IDS.map((templateId) => (
                      <View key={templateId} style={[styles.cell, { width: twoUp }]}>
                        <ShareCardPreview
                          maxWidth={twoUp}
                          format={formatId}
                          template={templateId}
                          {...PRIMARY.data!}
                        />
                        <View style={styles.cellFoot}>
                          <Text style={[styles.cellLabel, { color: theme.text }]}>
                            {SHARE_TEMPLATES[templateId].name}
                            {SHARE_TEMPLATES[templateId].bestFor === formatId ? ' ★' : ''}
                          </Text>
                          <Text style={[styles.cellMeta, { color: theme.muted }]}>
                            {size.baseWidth}×{size.baseHeight} @{format.width / size.baseWidth}×
                          </Text>
                          <FitBadge issue={fit.get(fitKey(GRID_SCOPE, formatId, templateId))} />
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })
          : null}

        <View style={{ height: Spacing.six }} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: {
    padding: Spacing.four,
    gap: Spacing.three,
    maxWidth: 900,
    alignSelf: 'center',
    width: '100%',
    alignItems: 'center',
  },
  kicker: { fontSize: 10, fontWeight: '800', letterSpacing: 1.6, alignSelf: 'flex-start' },
  title: { fontSize: 26, fontWeight: '800', fontFamily: Fonts.rounded, letterSpacing: -0.6, alignSelf: 'flex-start' },
  intro: { lineHeight: 19, alignSelf: 'flex-start' },
  code: { fontFamily: Fonts.mono, fontSize: 11 },
  isolated: { alignSelf: 'center' },
  section: { gap: Spacing.two, marginTop: Spacing.three, alignSelf: 'stretch' },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 6,
  },
  sectionTitle: { fontSize: 17, fontWeight: '800', fontFamily: Fonts.rounded, letterSpacing: -0.3 },
  sectionMeta: { fontSize: 11 },
  hint: { fontSize: 11, lineHeight: 15 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, paddingVertical: Spacing.one },
  rowScroll: { gap: Spacing.three, paddingVertical: Spacing.one },
  cell: { gap: 6, alignItems: 'center' },
  cellFoot: { alignItems: 'center', gap: 2 },
  cellLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
  cellMeta: { fontSize: 10 },
  meta: { fontSize: 11, textAlign: 'center' },
  badge: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeOk: { color: '#0A1019', backgroundColor: '#B7E93C' },
  badgeBad: { color: '#FFFFFF', backgroundColor: '#C2331F' },
  badgeWarn: { color: '#0A1019', backgroundColor: '#F0B429' },
  badgeIdle: { color: '#8B98A5', backgroundColor: 'rgba(139,152,165,0.18)' },
  allClear: { alignSelf: 'flex-start' },
  issues: { alignSelf: 'stretch', borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: Spacing.two, gap: 3 },
  issueTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, alignSelf: 'flex-start', backgroundColor: 'transparent', color: '#C2331F', paddingHorizontal: 0 },
  issueRow: { fontSize: 11, lineHeight: 15 },
});
