import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand } from '@/constants/app';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { useLicense } from '@/lib/license-context';
import { getVerifiedEmail } from '@/lib/license';
import { COFID_CREDIT } from '@/lib/food-search';
import { dailyReminderFromSettings, formatDailyReminderTime } from '@/lib/daily-reminders';
import { getSettings, saveSettings, type AppSettings } from '@/lib/settings';
import { syncDailyReminder } from '@/lib/daily-reminder-notifications';
import { syncWeighInReminder } from '@/lib/weigh-in-notifications';
import {
  formatReminderTime,
  parseReminderTime,
  type WeighInFrequency,
} from '@/lib/weigh-in-reminders';

export default function SettingsScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const theme = useTheme();
  const { license } = useLicense();

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [timeDraft, setTimeDraft] = useState('08:00');

  const accent = isDark ? Brand.lime : Brand.primaryDeep;
  const cardBg = isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF';
  const hairline = theme.line;

  useEffect(() => {
    getSettings().then((next) => {
      setSettings(next);
      setTimeDraft(formatReminderTime(next.weighInReminderHour, next.weighInReminderMinute));
    });
    getVerifiedEmail().then(setVerifiedEmail);
  }, []);

  async function persist(next: AppSettings) {
    setSettings(next);
    await saveSettings(next);
    void syncWeighInReminder();
    void syncDailyReminder();
  }

  async function toggle<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    if (!settings) return;
    await persist({ ...settings, [key]: value });
  }

  async function setFrequency(frequency: WeighInFrequency) {
    if (!settings) return;
    await persist({ ...settings, weighInReminderFrequency: frequency });
  }

  function commitTime() {
    if (!settings) return;
    const parsed = parseReminderTime(timeDraft);
    if (!parsed) {
      setTimeDraft(formatReminderTime(settings.weighInReminderHour, settings.weighInReminderMinute));
      return;
    }
    setTimeDraft(formatReminderTime(parsed.hour, parsed.minute));
    void persist({ ...settings, weighInReminderHour: parsed.hour, weighInReminderMinute: parsed.minute });
  }

  const email = license?.customerEmail ?? verifiedEmail ?? '—';
  // Shown to the user so the switch says exactly when the nudge will arrive.
  const dailyNudgeAt = formatDailyReminderTime(dailyReminderFromSettings({ remindersEnabled: true }));
  // Derive a display name from the email when no explicit name is stored
  const displayName = (() => {
    if (!email || email === '—') return '—';
    const prefix = email.split('@')[0] ?? '';
    if (!prefix) return email;
    return prefix.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  })();

  if (!license) return <Redirect href="/" />;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={({ pressed }) => [styles.backBtn, { borderColor: hairline }, pressed && styles.pressed]}
            >
              <Text style={[styles.backChevron, { color: accent }]}>‹</Text>
              <ThemedText type="smallBold">Back</ThemedText>
            </Pressable>
            <ThemedText type="title" style={styles.title}>
              Settings
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
              Tune how calibrEAT behaves on this device.
            </ThemedText>
          </View>

          <View style={[styles.card, { backgroundColor: cardBg, borderColor: hairline }]}>
            <ThemedText type="smallBold" style={styles.cardLabel}>
              PREFERENCES
            </ThemedText>

            {settings ? (
              <>
                <Row
                  label="Daily reminders"
                  detail={`One nudge a day at ${dailyNudgeAt}`}
                  value={settings.remindersEnabled}
                  onValueChange={(v) => toggle('remindersEnabled', v)}
                  accent={accent}
                  isDark={isDark}
                />
                <View style={[styles.divider, { backgroundColor: hairline }]} />
                <Row
                  label="Haptics"
                  detail="Taps and completions"
                  value={settings.hapticsEnabled}
                  onValueChange={(v) => toggle('hapticsEnabled', v)}
                  accent={accent}
                  isDark={isDark}
                />
                <View style={[styles.divider, { backgroundColor: hairline }]} />
                <Row
                  label="Weigh-in reminders"
                  detail="Alert on this device at a time you choose"
                  value={settings.weighInReminders}
                  onValueChange={(v) => toggle('weighInReminders', v)}
                  accent={accent}
                  isDark={isDark}
                />
                {settings.weighInReminders ? (
                  <View style={styles.reminderExtras}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Time
                    </ThemedText>
                    <TextInput
                      value={timeDraft}
                      onChangeText={setTimeDraft}
                      onBlur={commitTime}
                      onSubmitEditing={commitTime}
                      placeholder="08:00"
                      placeholderTextColor={theme.muted}
                      keyboardType="numbers-and-punctuation"
                      autoCorrect={false}
                      style={[styles.timeInput, { color: theme.text, borderColor: hairline, backgroundColor: isDark ? '#0C1420' : '#F6F7F4' }]}
                    />
                    <View style={styles.freqRow}>
                      {(
                        [
                          { id: 'daily', label: 'Daily' },
                          { id: 'every_2_days', label: 'Every 2 days' },
                          { id: 'weekly', label: 'Weekly' },
                        ] as const
                      ).map((opt) => {
                        const on = settings.weighInReminderFrequency === opt.id;
                        return (
                          <Pressable
                            key={opt.id}
                            onPress={() => void setFrequency(opt.id)}
                            style={({ pressed }) => [
                              styles.freqChip,
                              { borderColor: on ? accent : hairline, backgroundColor: on ? (isDark ? 'rgba(183,233,60,0.14)' : 'rgba(31,157,85,0.10)') : 'transparent' },
                              pressed && styles.pressed,
                            ]}
                          >
                            <Text style={[styles.freqChipText, { color: on ? accent : theme.text }]}>{opt.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <ThemedText type="small" themeColor="textSecondary">
                      Web preview cannot show a system alert. On a phone, allow notifications when asked.
                    </ThemedText>
                  </View>
                ) : null}
              </>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                Loading…
              </ThemedText>
            )}
          </View>

          <View style={[styles.card, { backgroundColor: cardBg, borderColor: hairline }]}>
            <ThemedText type="smallBold" style={styles.cardLabel}>
              ACCOUNT
            </ThemedText>
            <View style={styles.accountRow}>
              <ThemedText type="small" themeColor="textSecondary">
                Account:
              </ThemedText>
              <ThemedText type="smallBold" style={styles.accountValue}>
                {email} {displayName !== '—' && displayName.toLowerCase() !== email.toLowerCase() ? `· ${displayName}` : ''}
              </ThemedText>
            </View>
            <View style={styles.accountRow}>
              <ThemedText type="small" themeColor="textSecondary">
                Account status:
              </ThemedText>
              <View
                style={[
                  styles.statusPill,
                  {
                    backgroundColor: license
                      ? isDark
                        ? 'rgba(183,233,60,0.14)'
                        : 'rgba(31,157,85,0.10)'
                      : isDark
                        ? 'rgba(255,255,255,0.06)'
                        : 'rgba(0,0,0,0.05)',
                    borderColor: license ? accent : hairline,
                  },
                ]}
              >
                <View style={[styles.statusDot, { backgroundColor: license ? accent : theme.muted }]} />
                <Text style={[styles.statusText, { color: license ? accent : theme.muted }]}>
                  {license ? 'Activated' : 'Locked'}
                </Text>
              </View>
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.accountHint}>
              Lifetime access — 1 active device. Open Account from Home (menu) to deactivate and move, or email support if that device is gone.
            </ThemedText>
          </View>

          <ThemedText type="small" themeColor="textSecondary" style={styles.footerNote}>
            {COFID_CREDIT}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.footerNote}>
            calibrEAT will never store or sell your data. We believe in privacy for our users.
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Row({
  label,
  detail,
  value,
  onValueChange,
  accent,
  isDark,
}: {
  label: string;
  detail: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  accent: string;
  isDark: boolean;
}) {
  return (
    <View style={rowStyles.row}>
      <View style={rowStyles.text}>
        <ThemedText type="smallBold">{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(13,21,30,0.12)', true: accent }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={isDark ? 'rgba(255,255,255,0.18)' : 'rgba(13,21,30,0.12)'}
      />
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three, paddingVertical: 6 },
  text: { flex: 1, gap: 2 },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.three + 2,
  },
  header: { gap: 8 },
  backBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  backChevron: { fontSize: 18, fontWeight: '700', lineHeight: 18 },
  title: { fontSize: 28, lineHeight: 32 },
  subtitle: { lineHeight: 18 },
  card: { gap: Spacing.two, borderRadius: 22, borderWidth: 1, padding: Spacing.three + 2 },
  cardLabel: { letterSpacing: 1.2, opacity: 0.7, fontSize: 11 },
  divider: { height: StyleSheet.hairlineWidth, opacity: 1 },
  reminderExtras: { gap: 8, paddingTop: 4 },
  timeInput: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16, fontWeight: '700', letterSpacing: 0.6, maxWidth: 120 },
  freqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  freqChip: { borderWidth: 1.5, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 },
  freqChipText: { fontSize: 12, fontWeight: '800' },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  accountValue: { flexShrink: 1 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  statusDot: { width: 7, height: 7, borderRadius: 7 },
  statusText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  accountHint: { lineHeight: 17, marginTop: 2 },
  footerNote: { textAlign: 'center', lineHeight: 17, paddingHorizontal: Spacing.three },
  pressed: { opacity: 0.65 },
});
