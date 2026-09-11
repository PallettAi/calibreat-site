/**
 * Weigh-in reminder scheduler (npm run check:reminders).
 *
 * Next fire time is local clock math only — no OS notification APIs.
 */
import {
  dailyReminderFromSettings,
  formatDailyReminderTime,
  nextDailyReminderAt,
} from '../src/lib/daily-reminders.ts';
import {
  intervalDays,
  nextWeighInAt,
  parseFrequency,
  reminderFromSettings,
} from '../src/lib/weigh-in-reminders.ts';

let fails = 0;
const eq = (label, got, want) => {
  const ok = Object.is(got, want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

eq('daily interval', intervalDays('daily'), 1);
eq('every 2 days interval', intervalDays('every_2_days'), 2);
eq('weekly interval', intervalDays('weekly'), 7);
eq('unknown frequency defaults weekly', parseFrequency('sometimes'), 'weekly');

const mondayMorning = new Date(2026, 8, 7, 7, 15, 0, 0); // Mon 7:15
const mondayAfternoon = new Date(2026, 8, 7, 10, 0, 0, 0); // Mon 10:00

eq('disabled never fires', nextWeighInAt(mondayMorning, { enabled: false, hour: 8, minute: 0, frequency: 'daily' }), null);

const today = nextWeighInAt(mondayMorning, { enabled: true, hour: 8, minute: 0, frequency: 'daily' });
eq('daily before clock fires today', today?.toISOString(), new Date(2026, 8, 7, 8, 0, 0, 0).toISOString());

const tomorrow = nextWeighInAt(mondayAfternoon, { enabled: true, hour: 8, minute: 0, frequency: 'daily' });
eq('daily after clock fires tomorrow', tomorrow?.toISOString(), new Date(2026, 8, 8, 8, 0, 0, 0).toISOString());

const twoDays = nextWeighInAt(mondayAfternoon, { enabled: true, hour: 8, minute: 0, frequency: 'every_2_days' });
eq('every 2 days after clock skips a day', twoDays?.toISOString(), new Date(2026, 8, 9, 8, 0, 0, 0).toISOString());

const nextWeek = nextWeighInAt(mondayAfternoon, { enabled: true, hour: 8, minute: 0, frequency: 'weekly' });
eq('weekly after clock fires next week', nextWeek?.toISOString(), new Date(2026, 8, 14, 8, 0, 0, 0).toISOString());

const fromSettings = reminderFromSettings({
  weighInReminders: true,
  weighInReminderHour: 6,
  weighInReminderMinute: 30,
  weighInReminderFrequency: 'daily',
});
eq('settings map enabled', fromSettings.enabled, true);
eq('settings map hour', fromSettings.hour, 6);
eq('settings map minute', fromSettings.minute, 30);
eq('settings map frequency', fromSettings.frequency, 'daily');

const legacy = reminderFromSettings({ weighInReminders: false });
eq('legacy off stays off', legacy.enabled, false);
eq('legacy hour defaults morning', legacy.hour, 8);
eq('legacy frequency defaults weekly', legacy.frequency, 'weekly');

// ── Daily "log your day" nudge (the Settings switch that used to do nothing) ──

const nudgeOn = dailyReminderFromSettings({ remindersEnabled: true });
eq('daily nudge follows the switch (on)', nudgeOn.enabled, true);
eq('daily nudge follows the switch (off)', dailyReminderFromSettings({ remindersEnabled: false }).enabled, false);
eq('daily nudge ignores a missing switch', dailyReminderFromSettings({}).enabled, false);

eq('daily nudge label', formatDailyReminderTime(nudgeOn), '20:30');

eq('disabled daily nudge never fires', nextDailyReminderAt(mondayMorning, { ...nudgeOn, enabled: false }), null);

const evening = { enabled: true, hour: 20, minute: 30 };
const tonight = nextDailyReminderAt(new Date(2026, 8, 7, 9, 5, 0, 0), evening);
eq('daily nudge lands tonight', tonight?.toISOString(), new Date(2026, 8, 7, 20, 30, 0, 0).toISOString());
const tomorrowEvening = nextDailyReminderAt(new Date(2026, 8, 7, 21, 0, 0, 0), evening);
eq('daily nudge rolls to tomorrow once passed', tomorrowEvening?.toISOString(), new Date(2026, 8, 8, 20, 30, 0, 0).toISOString());
const exactly = nextDailyReminderAt(new Date(2026, 8, 7, 20, 30, 0, 0), evening);
eq('daily nudge is strictly in the future', exactly?.toISOString(), new Date(2026, 8, 8, 20, 30, 0, 0).toISOString());

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
