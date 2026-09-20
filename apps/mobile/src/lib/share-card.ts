/**
 * Content logic for the weekly share card (the branded image a user posts to
 * stories / sends to a friend from Trends). Pure and testable — the view that
 * renders it lives in components/weekly-share-card.tsx, and the native capture
 * + share-sheet half lives at the bottom of that file.
 *
 * Copy rule (from the growth research): the card celebrates *behavior* —
 * logging streaks, coverage, a measured trend — never bodies. No weight
 * before/after framing, no moralizing.
 */

import type { StreakState } from '@/lib/streak';
import type { BurnTrend } from '@/lib/trends';

// Inlined from constants/app.ts (AppMeta.tagline / AppMeta.websiteUrl) so this
// module stays dependency-free and node-runnable under scripts/check-share.mjs
// — the same leaf-module pattern as trends.ts / streak.ts.
export const SHARE_SITE_URL = 'https://calibreat.co.uk';
export const SHARE_TAGLINE_TEXT = 'Calibrate your eating lifestyle.';

export type ShareStats = {
  streak: StreakState;
  /** Logging coverage over the trailing window, from lib/trends. */
  coverage: { logged: number; days: number };
  burn: BurnTrend | null;
};

export type ShareCopy = {
  /** Big line on the card, e.g. "12-day logging streak". */
  headline: string;
  /** One supporting line, e.g. "6 of 7 days logged · True Burn steady". */
  subline: string;
};

export type ShareCard = {
  eligible: true;
  copy: ShareCopy;
};

export type ShareDecision = ShareCard | { eligible: false; reason: 'empty' };

/** A brand-new user with no streak, no coverage and no burn data can't share yet. */
export function buildShareCard(stats: ShareStats): ShareDecision {
  const { streak, coverage, burn } = stats;
  const hasStreak = streak.current >= 2 || streak.best >= 2;
  const hasCoverage = coverage.days > 0 && coverage.logged > 0;
  const hasBurn = burn != null;
  if (!hasStreak && !hasCoverage && !hasBurn) return { eligible: false, reason: 'empty' };
  return { eligible: true, copy: shareCopy(stats) };
}

/** Headline picks the strongest behavior; subline packs the rest. */
export function shareCopy(stats: ShareStats): ShareCopy {
  const { streak, coverage, burn } = stats;
  const hasStreak = streak.current >= 2 || streak.best >= 2;
  const hasCoverage = coverage.days > 0 && coverage.logged > 0;

  if (hasStreak) {
    // Current run when it's alive; otherwise the personal best, still framed
    // as an active achievement ("best run") rather than a broken streak.
    const alive = streak.current >= 2;
    const days = alive ? streak.current : streak.best;
    const label = alive ? 'logging streak' : 'best logging run';
    return {
      headline: `${days}-day ${label}`,
      subline: subline(stats),
    };
  }
  if (hasCoverage) {
    return {
      headline: `${coverage.logged} day${coverage.logged === 1 ? '' : 's'} logged this week`,
      subline: subline(stats),
    };
  }
  // Burn-only (rare: burn needs weigh-ins, which need logging days).
  const latest = burn ? Math.round(burn.latest).toLocaleString() : '';
  return {
    headline: latest ? `${latest} kcal measured burn` : 'Measuring my burn',
    subline: subline(stats),
  };
}

function subline(stats: ShareStats): string {
  const parts: string[] = [];
  const { streak, coverage, burn } = stats;
  const hasStreak = streak.current >= 2 || streak.best >= 2;
  if (coverage.days > 0 && coverage.logged > 0) {
    parts.push(`${coverage.logged}/${coverage.days} days logged`);
  }
  if (!hasStreak && (streak.current > 0 || streak.best > 0)) {
    // Streak too short for the headline — still worth a nod in the subline.
    const best = Math.max(streak.current, streak.best);
    parts.push(`${best}-day best`);
  }
  if (burn) {
    parts.push(burnDriftPhrase(burn));
  }
  return parts.join(' · ');
}

/**
 * True Burn phrasing — steady drift is the impressive part ("the
 * measurement moved less than my guesses ever did"), so present the drift
 * directly and honestly.
 */
export function burnDriftPhrase(burn: BurnTrend): string {
  if (burn.driftPerWeek == null || Math.abs(burn.driftPerWeek) < 15) {
    return `True Burn steady at ${Math.round(burn.latest).toLocaleString()}`;
  }
  const dir = burn.driftPerWeek > 0 ? 'up' : 'down';
  return `True Burn ${dir} ${Math.abs(Math.round(burn.driftPerWeek)).toLocaleString()} kcal/wk`;
}

/** Footer tagline + URL baked into the card. */
export function shareTagline(): string {
  return `${SHARE_TAGLINE_TEXT} — ${SHARE_SITE_URL.replace(/^https:\/\//, '')}`;
}

/** Result of the platform capture + share step (share-card.native / .web). */
export type ShareImageResult =
  | { ok: true; method: 'share' }
  | { ok: false; method: 'error'; message: string };
