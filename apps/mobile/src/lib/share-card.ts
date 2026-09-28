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

/** The one big number a card leads with (Instrument / Momentum layouts). */
export type ShareHero = {
  /** Formatted for display — already carries its unit where it needs one. */
  value: string;
  /** What the number is, e.g. "measured burn" or "days logged". */
  label: string;
};

/** One row of the week-as-data layout. */
export type ShareDataRow = {
  label: string;
  value: string;
};

/**
 * The medal an achievement card hangs: a name arched across the disc, a unit of
 * the achievement under it, and the metal it is struck in. Tone is earned, not
 * decorative — a live run is gold, a personal best that has ended is silver, a
 * first honest week is bronze.
 */
export type ShareAchievement = {
  /** Arched across the top of the medal. Keep it short — it has to bend. */
  title: string;
  /** Arched across the bottom, e.g. "12 DAYS". */
  subtitle: string;
  tone: 'gold' | 'silver' | 'bronze' | 'accent';
};

/**
 * The claim stamped beside the number ("NEW PR!" in the reference).
 *
 * Only ever one of three honest things: the goal was completed, the current run
 * is the user's best, or neither and the card just says so. A share card that
 * shouts NEW PR! when nothing was beaten is the fastest way to lose the user's
 * trust in every other number on it.
 */
export type ShareStatus = {
  label: string;
  tone: 'accent' | 'muted' | 'metal';
};

/** A goal track: how much of what was planned actually happened. */
export type ShareProgress = {
  /** 0…1 */
  pct: number;
  value: string;
  target: string;
  label: string;
};

export type ShareCard = {
  eligible: true;
  copy: ShareCopy;
  hero: ShareHero;
  rows: ShareDataRow[];
  /** Caps headline above the card's content, e.g. "LOGGING STREAK". */
  eyebrow: string;
  achievement: ShareAchievement;
  status: ShareStatus;
  /** The comparison a record card needs: "BEST RUN · 20 d". */
  best: ShareDataRow;
  progress: ShareProgress;
};

export type ShareDecision = ShareCard | { eligible: false; reason: 'empty' };

/** A brand-new user with no streak, no coverage and no burn data can't share yet. */
export function buildShareCard(stats: ShareStats): ShareDecision {
  const { streak, coverage, burn } = stats;
  const hasStreak = streak.current >= 2 || streak.best >= 2;
  const hasCoverage = coverage.days > 0 && coverage.logged > 0;
  const hasBurn = burn != null;
  if (!hasStreak && !hasCoverage && !hasBurn) return { eligible: false, reason: 'empty' };
  return {
    eligible: true,
    copy: shareCopy(stats),
    hero: shareHero(stats),
    rows: shareRows(stats),
    eyebrow: shareEyebrow(stats),
    achievement: shareAchievement(stats),
    status: shareStatus(stats),
    best: shareBestRow(stats),
    progress: shareProgress(stats),
  };
}

/** Caps label naming what the card is celebrating. */
export function shareEyebrow(stats: ShareStats): string {
  const { streak, coverage, burn } = stats;
  if (streak.current >= 2 || streak.best >= 2) return 'Logging streak';
  if (coverage.days > 0 && coverage.logged > 0) return 'Weekly coverage';
  if (burn) return 'Measured burn';
  return 'Your week';
}

/**
 * The medal. The title names the *behaviour*, never the body, and the metal is
 * earned: gold for a run still alive, silver for a best that has ended, bronze
 * for an honest week without a run, accent for a measurement-only week.
 */
export function shareAchievement(stats: ShareStats): ShareAchievement {
  const { streak, coverage, burn } = stats;
  if (streak.current >= 2) return { title: 'Streak keeper', subtitle: `${streak.current} days`, tone: 'gold' };
  if (streak.best >= 2) return { title: 'Best run', subtitle: `${streak.best} days`, tone: 'silver' };
  if (coverage.days > 0 && coverage.logged > 0) {
    return { title: 'Steady week', subtitle: `${coverage.logged}/${coverage.days} days`, tone: 'bronze' };
  }
  return { title: 'Calibrated', subtitle: burn ? `${Math.round(burn.latest).toLocaleString()} kcal` : 'measured', tone: 'accent' };
}

/** The stamp. Completed goal beats personal best beats an honest "on track". */
export function shareStatus(stats: ShareStats): ShareStatus {
  const { streak, coverage } = stats;
  if (coverage.days > 0 && coverage.logged >= coverage.days) return { label: 'Goal met!', tone: 'accent' };
  if (streak.current >= 2 && streak.current >= streak.best) return { label: 'Best yet', tone: 'accent' };
  if (streak.current >= 2 || coverage.logged > 0) return { label: 'On track', tone: 'muted' };
  return { label: 'Measuring', tone: 'metal' };
}

/** "Old PR: 22:30" in the reference — here, the run to beat. */
export function shareBestRow(stats: ShareStats): ShareDataRow {
  const best = Math.max(stats.streak.current, stats.streak.best);
  return { label: 'best run', value: best >= 2 ? `${best} d` : '—' };
}

/**
 * The one stat in the card's footer strip.
 *
 * Normally the run to beat. But on an achievement card the medal already arches
 * that exact claim across the disc ("Best run · 30 days"), so printing "BEST RUN
 * 30 d" in the strip as well puts the same fact on one image twice. When the
 * medal has taken the record, the strip falls back to the week's coverage — a
 * different fact, from the same real data.
 */
export function shareStripRow(
  achievement: ShareAchievement,
  best: ShareDataRow,
  progress?: ShareProgress,
): ShareDataRow {
  const medalNamesTheRecord = /best/i.test(achievement.title);
  if (medalNamesTheRecord && progress && progress.target !== '0') {
    return { label: progress.label, value: `${progress.value}/${progress.target}` };
  }
  return best;
}

/**
 * The goal track: logging coverage, because that is the goal a user actually
 * sets and hits in this app ("eat 7/7 days"), rather than a number invented for
 * the card. `pct` is clamped so a data glitch cannot draw a bar past its track.
 */
export function shareProgress(stats: ShareStats): ShareProgress {
  const { coverage } = stats;
  const target = Math.max(0, coverage.days);
  const value = Math.max(0, Math.min(target, coverage.logged));
  return {
    pct: target > 0 ? Math.max(0, Math.min(1, value / target)) : 0,
    value: String(value),
    target: String(target),
    label: 'Days logged',
  };
}

/**
 * The card's single biggest number, chosen the same way the headline is: the
 * live streak beats coverage beats measured burn. Kept separate from `copy` so
 * a layout can show the hero large while the headline stays a sentence.
 */
export function shareHero(stats: ShareStats): ShareHero {
  const { streak, coverage, burn } = stats;
  if (streak.current >= 2) return { value: String(streak.current), label: 'day streak' };
  if (coverage.logged > 0) return { value: String(coverage.logged), label: coverage.logged === 1 ? 'day logged' : 'days logged' };
  if (streak.best >= 2) return { value: String(streak.best), label: 'day best run' };
  if (burn) return { value: Math.round(burn.latest).toLocaleString(), label: 'kcal measured burn' };
  return { value: '—', label: 'nothing logged yet' };
}

/**
 * The week as four facts for the data layout. Every row is something the app
 * actually measured; nothing is estimated or invented to fill space.
 */
export function shareRows(stats: ShareStats): ShareDataRow[] {
  const { streak, coverage, burn } = stats;
  const rows: ShareDataRow[] = [];
  if (coverage.days > 0) rows.push({ label: 'days logged', value: `${coverage.logged}/${coverage.days}` });
  if (streak.current > 0 || streak.best > 0) {
    rows.push({ label: 'streak', value: `${Math.max(streak.current, streak.best)} d` });
  }
  if (burn) {
    rows.push({ label: 'true burn', value: `${Math.round(burn.latest).toLocaleString()} kcal` });
    if (burn.driftPerWeek != null && Math.abs(burn.driftPerWeek) >= 15) {
      const dir = burn.driftPerWeek > 0 ? '+' : '−';
      rows.push({
        label: 'drift',
        value: `${dir}${Math.abs(Math.round(burn.driftPerWeek)).toLocaleString()} kcal/wk`,
      });
    }
  }
  return rows;
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

const SHARE_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHARE_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];

/**
 * "Sunday 20 Sept" for the achievement card.
 *
 * Spelled out from tables rather than `toLocaleDateString`: the card is captured
 * on-device, and Hermes builds ship without full ICU, so an Intl call is a
 * locale-dependent crash risk for a string that only has to read well.
 */
export function shareDateLabel(date: Date, days: string[] = SHARE_DAYS, months: string[] = SHARE_MONTHS): string {
  const weekday = days[date.getDay()] ?? '';
  const month = months[date.getMonth()] ?? '';
  return `${weekday} ${date.getDate()} ${month}`.trim();
}

/** Footer tagline + URL baked into the card. */
export function shareTagline(): string {
  return `${SHARE_TAGLINE_TEXT} — ${SHARE_SITE_URL.replace(/^https:\/\//, '')}`;
}

/** Result of the platform capture + share step (share-card-capture.ts). */
export type ShareImageResult =
  | { ok: true; method: 'share' }
  | { ok: false; method: 'error'; message: string };
