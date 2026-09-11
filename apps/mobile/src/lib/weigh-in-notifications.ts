import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { getSettings } from '@/lib/settings';
import { nextWeighInAt, reminderFromSettings } from '@/lib/weigh-in-reminders';

const NOTIFICATION_ID = 'calibreat-weigh-in';
const CHANNEL_ID = 'weigh-in';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.status === 'granted';
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Weigh-in reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

let armed = false;

export function armWeighInReminderReschedule(): void {
  if (armed) return;
  armed = true;
  Notifications.addNotificationReceivedListener(() => {
    void syncWeighInReminder();
  });
}

export async function syncWeighInReminder(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID);
  } catch {
    // nothing scheduled yet
  }

  const reminder = reminderFromSettings(await getSettings());
  if (!reminder.enabled) return;
  if (!(await ensurePermission())) return;

  const when = nextWeighInAt(new Date(), reminder);
  if (!when) return;

  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: {
      title: 'Weigh in',
      body: 'Log today’s weight so True Burn can keep measuring.',
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: when,
      channelId: CHANNEL_ID,
    },
  });
}
