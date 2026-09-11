/**
 * Weigh-in reminder scheduler (npm run check:reminders).
 *
 * Next fire time is local clock math only — no OS notification APIs.
 */
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

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
