import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { dailyReminderFromSettings, nextDailyReminderAt } from '@/lib/daily-reminders';
import { getSettings } from '@/lib/settings';

/**
 * Schedules the one-per-day "log your day" nudge behind the Settings switch.
 *
 * The shared notification *handler* (what a delivered notification shows) is
 * registered once by `weigh-in-notifications`; both modules are loaded from
 * `_layout`, so only that one registers it.
 */
const NOTIFICATION_ID = 'calibreat-daily-log';
const CHANNEL_ID = 'daily-log';

async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.status === 'granted';
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Daily logging nudge',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

let armed = false;

/** Re-schedule when one fires, so the nudge keeps rolling day to day. */
export function armDailyReminderReschedule(): void {
  if (armed) return;
  armed = true;
  Notifications.addNotificationReceivedListener((notification) => {
    if (notification.request.identifier !== NOTIFICATION_ID) return;
    void syncDailyReminder();
  });
}

export async function syncDailyReminder(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID);
  } catch {
    // nothing scheduled yet
  }

  const reminder = dailyReminderFromSettings(await getSettings());
  if (!reminder.enabled) return;
  if (!(await ensurePermission())) return;

  const when = nextDailyReminderAt(new Date(), reminder);
  if (!when) return;

  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: {
      title: 'Log your day',
      body: 'Add what you ate so today’s calibration stays accurate.',
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: when,
      channelId: CHANNEL_ID,
    },
  });
}
