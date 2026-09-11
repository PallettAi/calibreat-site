/**
 * Daily "log your day" nudge — local clock math only.
 *
 * The Settings switch (`remindersEnabled`) used to be persisted and rendered but
 * never read by anything, so it promised a nudge and did nothing. This module is
 * the missing read: the OS scheduling lives in `daily-reminder-notifications`
 * (native) / `daily-reminder-notifications.web` (no-op), and the arithmetic
 * lives here so `npm run check:reminders` can verify it without a device.
 *
 * One nudge a day, in the evening when the day's log is usually still open.
 */

export const DAILY_REMINDER_HOUR = 20;
export const DAILY_REMINDER_MINUTE = 30;

export type DailyReminderConfig = {
  enabled: boolean;
  hour: number;
  minute: number;
};

export function dailyReminderFromSettings(settings: { remindersEnabled?: unknown }): DailyReminderConfig {
  return {
    enabled: settings.remindersEnabled === true,
    hour: DAILY_REMINDER_HOUR,
    minute: DAILY_REMINDER_MINUTE,
  };
}

/** Next fire time strictly after `from`; null when the switch is off. */
export function nextDailyReminderAt(from: Date, config: DailyReminderConfig): Date | null {
  if (!config.enabled) return null;
  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setHours(config.hour, config.minute, 0, 0);
  if (next.getTime() <= from.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

export function formatDailyReminderTime(config: DailyReminderConfig): string {
  return `${String(config.hour).padStart(2, '0')}:${String(config.minute).padStart(2, '0')}`;
}
