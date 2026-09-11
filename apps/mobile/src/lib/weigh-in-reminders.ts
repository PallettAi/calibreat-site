/** Local weigh-in reminder clock math. OS scheduling lives in weigh-in-notifications. */

export type WeighInFrequency = 'daily' | 'every_2_days' | 'weekly';

export type WeighInReminderConfig = {
  enabled: boolean;
  hour: number;
  minute: number;
  frequency: WeighInFrequency;
};

export const DEFAULT_WEIGH_IN_HOUR = 8;
export const DEFAULT_WEIGH_IN_MINUTE = 0;
export const DEFAULT_WEIGH_IN_FREQUENCY: WeighInFrequency = 'weekly';

export function intervalDays(frequency: WeighInFrequency): number {
  if (frequency === 'daily') return 1;
  if (frequency === 'every_2_days') return 2;
  return 7;
}

export function parseFrequency(value: unknown): WeighInFrequency {
  if (value === 'daily' || value === 'every_2_days' || value === 'weekly') return value;
  return DEFAULT_WEIGH_IN_FREQUENCY;
}

export function clampHour(value: unknown): number {
  const hour = Number(value);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_WEIGH_IN_HOUR;
}

export function clampMinute(value: unknown): number {
  const minute = Number(value);
  return Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : DEFAULT_WEIGH_IN_MINUTE;
}

export function reminderFromSettings(settings: {
  weighInReminders: boolean;
  weighInReminderHour?: unknown;
  weighInReminderMinute?: unknown;
  weighInReminderFrequency?: unknown;
}): WeighInReminderConfig {
  return {
    enabled: settings.weighInReminders === true,
    hour: clampHour(settings.weighInReminderHour),
    minute: clampMinute(settings.weighInReminderMinute),
    frequency: parseFrequency(settings.weighInReminderFrequency),
  };
}

export function nextWeighInAt(from: Date, reminder: WeighInReminderConfig): Date | null {
  if (!reminder.enabled) return null;
  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setHours(reminder.hour, reminder.minute, 0, 0);
  if (next.getTime() <= from.getTime()) {
    next.setDate(next.getDate() + intervalDays(reminder.frequency));
  }
  return next;
}

export function formatReminderTime(hour: number, minute: number): string {
  return `${String(clampHour(hour)).padStart(2, '0')}:${String(clampMinute(minute)).padStart(2, '0')}`;
}

export function parseReminderTime(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return { hour, minute };
}
