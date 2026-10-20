/**
 * The one remaining-calorie number (Android test cluster).
 *
 * Home, macros, trends, Train copy and the widget snapshot read only this
 * object; none of them add workout kcal themselves. Built from the week bank
 * (`week-bank.ts`), the activity source (`activity-burn.ts`) and today's food.
 * Pure: no React, no native APIs.
 */

import {
  activitySurplus,
  selectActivityBurn,
  sourceLabel,
  type BurnSource,
} from './activity-burn.ts';
import { computeWeekBank } from './week-bank.ts';

/** Upper bound on today's target. The week bank already keeps it ≥ 0. */
export const DAY_TARGET_MAX_KCAL = 6000;

export type DayBudgetInput = {
  todayKey: string;
  /** True Burn override if set, else stored goals.calorieTarget. */
  baseTarget: number;
  /** Stored goals row. Null means no TDEE/BMR, so no surplus eat-back. */
  goals: { tdee: number; bmr: number } | null;
  /** Food kcal by dayKey for the whole diary (only the open week is read). */
  foodByDay: Record<string, number>;
  activity: {
    connected: boolean;
    hcActiveKcal: number;
    hcExerciseCount: number;
    trainMetKcal: number;
  };
};

export type DayBudget = {
  baseTarget: number;
  /** bankedToday + surplus, capped at DAY_TARGET_MAX_KCAL. */
  todayTarget: number;
  /** todayTarget − today's food. Negative when over budget. */
  remaining: number;
  surplus: number;
  burnSource: BurnSource;
  measuredActiveKcal: number;
  weekLeftover: number;
  daysLeft: number;
  /** Source line for the UI: 'Health Connect' | 'Train estimate' | ''. */
  sourceLabel: string;
  /** Week pool bookkeeping for the calorie card line. */
  weekPool: number;
  bankedToday: number;
};

export function computeDayBudget(input: DayBudgetInput): DayBudget | null {
  const base = Number.isFinite(input.baseTarget) ? Math.max(0, Math.round(input.baseTarget)) : 0;
  const bank = computeWeekBank({ todayKey: input.todayKey, baseTarget: base, foodByDay: input.foodByDay });
  if (bank == null) return null;

  const burn = selectActivityBurn({
    connected: input.activity.connected,
    hcActiveKcal: input.activity.hcActiveKcal,
    hcExerciseCount: input.activity.hcExerciseCount,
    trainMetKcal: input.activity.trainMetKcal,
  });
  const surplus = activitySurplus({
    measuredKcal: burn.kcal,
    tdee: input.goals?.tdee ?? null,
    bmr: input.goals?.bmr ?? null,
  });

  const todayTarget = Math.min(DAY_TARGET_MAX_KCAL, bank.bankedToday + surplus);
  const todayFood = Math.max(0, input.foodByDay[input.todayKey] ?? 0);

  return {
    baseTarget: base,
    todayTarget,
    remaining: Math.round(todayTarget - todayFood),
    surplus,
    burnSource: burn.source,
    measuredActiveKcal: burn.kcal,
    weekLeftover: bank.weekLeftover,
    daysLeft: bank.daysLeft,
    sourceLabel: sourceLabel(burn.source),
    weekPool: bank.weekPool,
    bankedToday: bank.bankedToday,
  };
}

/**
 * Home copy for the activity line (spec §9). Surplus > 0 names the extra;
 * zero with a real source says the activity is already inside the target.
 */
export function activityCopy(budget: Pick<DayBudget, 'surplus' | 'burnSource'>): string {
  if (budget.burnSource === 'none') return '';
  if (budget.surplus > 0) return `+${budget.surplus} kcal from a bigger-than-usual day`;
  return 'Activity is inside your usual target';
}

/** Week line (spec §9): `{leftover} kcal left this week · {daysLeft} days`. */
export function weekCopy(budget: Pick<DayBudget, 'weekLeftover' | 'daysLeft'>): string {
  const left = Math.round(budget.weekLeftover);
  const grouped = String(left).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${grouped} kcal left this week · ${budget.daysLeft} ${budget.daysLeft === 1 ? 'day' : 'days'}`;
}
