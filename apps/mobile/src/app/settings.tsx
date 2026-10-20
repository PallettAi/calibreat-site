import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand } from '@/constants/app';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useKeyboardReveal } from '@/hooks/use-keyboard-reveal';
import { useTheme } from '@/hooks/use-theme';
import { connectHealthConnect, disconnectHealthConnect, isHealthConnectEnabled } from '@/lib/health-connect';
import { COFID_CREDIT } from '@/lib/food-search';
import { dailyReminderFromSettings, formatDailyReminderTime } from '@/lib/daily-reminders';
import { applyThemeMode, getSettings, saveSettings, type AppSettings } from '@/lib/settings';
import { type ThemeMode } from '@/lib/theme-mode';
import { syncDailyReminder } from '@/lib/daily-reminder-notifications';
import { syncWeighInReminder } from '@/lib/weigh-in-notifications';
import {
  formatReminderTime,
  parseReminderTime,
  type WeighInFrequency,
} from '@/lib/weigh-in-reminders';
import {
  buildExportBundle,
  describeBundle,
  diaryCsv,
  exportFileName,
  type ExportInput,
} from '@/lib/export';
import { shareExport } from '@/lib/export-share';
import { pickBackupText, pickDiaryText } from '@/lib/restore-file';
import {
  describeSource,
  formatDayRange,
  readDiaryCsv,
  type DateOrder,
} from '@/lib/import-diary';
import {
  describePlan,
  describePlanNotes,
  describeRestored,
  formatExportedAt,
  parseBackup,
  planRestore,
  validateRestoreRows,
  type RestoreCurrent,
  type RestoreMode,
  type RestorePlan,
} from '@/lib/restore';
import {
  applyRestore,
  getAllLogs,
  getAllWater,
  getAllWeighIns,
  getAllWorkouts,
  getGoals,
  getProfile,
  getSavedMeals,
} from '@/lib/db';

export default function SettingsScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const theme = useTheme();
  const keyboard = useKeyboardReveal();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [timeDraft, setTimeDraft] = useState('08:00');
  const [exportInput, setExportInput] = useState<ExportInput | null>(null);
  const [exportBusy, setExportBusy] = useState<'backup' | 'diary' | null>(null);
  const [hcOn, setHcOn] = useState(false);
  const [hcNote, setHcNote] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    isHealthConnectEnabled().then((v) => {
      if (!cancelled) setHcOn(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Turning it on asks Health Connect; a denial or a missing app leaves it off. */
  async function toggleHealthConnect(next: boolean) {
    setHcNote(null);
    if (!next) {
      await disconnectHealthConnect();
      setHcOn(false);
      return;
    }
    const result = await connectHealthConnect();
    setHcOn(result === 'connected');
    if (result === 'denied') setHcNote('Permission not granted. Train estimates stay in use.');
    if (result === 'unavailable') setHcNote('Health Connect is not on this phone. Android 14+ or the Health Connect app is needed.');
  }
  const [exportNote, setExportNote] = useState<string | null>(null);
  // Restore holds a parsed file and both plans until the user picks one.
  // Nothing is written until they do. A backup and a diary import share this
  // state and this preview, because they are the same decision — show me what
  // this file would do to my diary — with only the title and the notes
  // differing. `importText` is kept only for a diary whose dates could be read
  // two ways, so the reading can be swapped without re-picking the file.
  const [restore, setRestore] = useState<{
    kind: 'backup' | 'import';
    title: string;
    notes: string[];
    warnings: string[];
    merge: RestorePlan;
    replace: RestorePlan;
    dateOrder?: DateOrder;
    importText?: string;
  } | null>(null);
  const [restoreMode, setRestoreMode] = useState<RestoreMode>('merge');
  const [restoreBusy, setRestoreBusy] = useState(false);

  const accent = isDark ? Brand.lime : Brand.primaryDeep;
  const cardBg = isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF';
  const hairline = theme.line;

  useEffect(() => {
    getSettings().then((next) => {
      setSettings(next);
      setTimeDraft(formatReminderTime(next.weighInReminderHour, next.weighInReminderMinute));
    });
  }, []);

  async function loadExportInput(): Promise<ExportInput> {
    const [profile, goals, logEntries, weighIns, water, workouts, savedMeals] = await Promise.all([
      getProfile(),
      getGoals(),
      getAllLogs(),
      getAllWeighIns(),
      getAllWater(),
      getAllWorkouts(),
      getSavedMeals(),
    ]);
    const input: ExportInput = {
      profile,
      goals,
      logEntries,
      weighIns,
      water,
      workouts,
      savedMeals,
    };
    setExportInput(input);
    return input;
  }

  async function runExport(kind: 'backup' | 'diary') {
    if (exportBusy) return;
    setExportBusy(kind);
    setExportNote(null);
    try {
      const input = exportInput ?? (await loadExportInput());
      const now = new Date();
      const fileName = exportFileName(kind, now);
      const payload =
        kind === 'backup'
          // Compact on purpose: the file is for machines and 6-figure-char backups
          // ship noticeably faster through the share sheet than pretty-printed ones.
          ? JSON.stringify(buildExportBundle(input))
          : diaryCsv(input.logEntries);
      const result = await shareExport(kind, fileName, payload);
      if (result.ok) {
        setExportNote(kind === 'backup' ? 'Backup shared.' : 'Diary shared.');
      } else if (result.method === 'clipboard') {
        setExportNote(result.message ?? 'Copied to your clipboard instead.');
      } else {
        setExportNote(result.message ?? 'Export failed. Try again.');
      }
    } catch {
      setExportNote('Could not read your data to export it. Try again.');
    } finally {
      setExportBusy(null);
    }
  }

  /** What is already on this device, in the shape de-duplication needs. The
   *  export input already holds every one of these tables, so a restore costs
   *  no extra reads. */
  function currentForRestore(input: ExportInput | null): RestoreCurrent {
    return {
      logEntries: input?.logEntries ?? [],
      weighIns: input?.weighIns ?? [],
      water: input?.water ?? [],
      workouts: input?.workouts ?? [],
      savedMeals: input?.savedMeals ?? [],
      hasProfile: Boolean(input?.profile),
    };
  }

  /** Pick a file, read it, and show what restoring it would do. Writes
   *  nothing — the plan waits on an explicit choice. */
  async function runPickBackup() {
    if (restoreBusy) return;
    setRestoreBusy(true);
    setRestore(null);
    setExportNote(null);
    try {
      const picked = await pickBackupText();
      if (!picked.ok) {
        if (!picked.cancelled) setExportNote(picked.message ?? 'Could not open that file.');
        return;
      }
      const parsed = parseBackup(picked.text);
      if (!parsed.ok) {
        setExportNote(parsed.message);
        return;
      }
      const current = currentForRestore(exportInput ?? (await loadExportInput()));
      setRestore({
        kind: 'backup',
        title: `Backup from ${formatExportedAt(parsed.bundle.exportedAt)}`,
        notes: [],
        warnings: parsed.warnings,
        merge: planRestore(parsed.bundle, current, 'merge'),
        replace: planRestore(parsed.bundle, current, 'replace'),
      });
      setRestoreMode('merge');
    } catch {
      setExportNote('Could not read that file. Try again.');
    } finally {
      setRestoreBusy(false);
    }
  }

  /** Read a diary CSV and show what importing it would do. Writes nothing —
   *  the imported rows are handed to the restore validator and planned
   *  exactly as a backup is, so an import can never take a different route
   *  into the diary than a restore does. */
  async function showImportPreview(text: string, dateOrder?: DateOrder) {
    const parsed = readDiaryCsv(text, dateOrder);
    if (!parsed.ok) {
      setRestore(null);
      setExportNote(parsed.message);
      return;
    }
    const scan = parsed.scan;
    const validated = validateRestoreRows({ logEntries: scan.rows });
    if (!validated.ok) {
      setRestore(null);
      setExportNote(validated.message);
      return;
    }
    const current = currentForRestore(exportInput ?? (await loadExportInput()));
    setRestore({
      kind: 'import',
      title: `${describeSource(scan.source)} · ${formatDayRange(scan.firstDay, scan.lastDay)}`,
      notes: scan.notes,
      warnings: validated.warnings,
      merge: planRestore(validated.bundle, current, 'merge'),
      replace: planRestore(validated.bundle, current, 'replace'),
      // Only offer the swap when the file itself could not settle the reading.
      dateOrder: scan.ambiguousDates ? scan.dateOrder : undefined,
      importText: scan.ambiguousDates ? text : undefined,
    });
    setRestoreMode('merge');
  }

  async function runPickDiary() {
    if (restoreBusy) return;
    setRestoreBusy(true);
    setRestore(null);
    setExportNote(null);
    try {
      const picked = await pickDiaryText();
      if (!picked.ok) {
        if (!picked.cancelled) setExportNote(picked.message ?? 'Could not open that file.');
        return;
      }
      await showImportPreview(picked.text);
    } catch {
      setExportNote('Could not read that file. Try again.');
    } finally {
      setRestoreBusy(false);
    }
  }

  /** D/M/Y and M/D/Y are the same two numbers in a different order, so a file
   *  where every date fits both could land a whole year of meals on the wrong
   *  days. Rather than pick and hope, the preview says which reading was used
   *  and lets it be flipped before anything is written. */
  async function swapDateOrder() {
    if (!restore?.importText || !restore.dateOrder || restoreBusy) return;
    setRestoreBusy(true);
    try {
      await showImportPreview(restore.importText, restore.dateOrder === 'dmy' ? 'mdy' : 'dmy');
    } finally {
      setRestoreBusy(false);
    }
  }

  async function confirmRestore() {
    if (!restore || restoreBusy) return;
    setRestoreBusy(true);
    setExportNote(null);
    const plan = restoreMode === 'replace' ? restore.replace : restore.merge;
    // Both kinds of note are repeated after the write: what the file was read
    // as, and what was left out. The user should not have to remember the
    // preview to know which reading their diary landed on.
    const warnings = [...restore.notes, ...restore.warnings];
    try {
      await applyRestore(plan);
      // The cached export input is now a lie — every table just changed.
      await loadExportInput();
      const notes = describePlanNotes(plan, warnings);
      setExportNote(notes ? `${describeRestored(plan)} ${notes}` : describeRestored(plan));
      setRestore(null);
    } catch {
      setExportNote('That did not finish, so nothing was changed. Try again.');
    } finally {
      setRestoreBusy(false);
    }
  }

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

  async function setThemeMode(mode: ThemeMode) {
    if (!settings) return;
    applyThemeMode(mode);
    await persist({ ...settings, themeMode: mode });
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

  // Shown to the user so the switch says exactly when the nudge will arrive.
  const dailyNudgeAt = formatDailyReminderTime(dailyReminderFromSettings({ remindersEnabled: true }));
  const exportSummary = exportInput ? describeBundle(buildExportBundle(exportInput)) : null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <ScrollView {...keyboard.scrollProps} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
                <View style={styles.reminderExtras}>
                  <ThemedText type="smallBold">Theme</ThemedText>
                  <View style={styles.freqRow}>
                    {(
                      [
                        { id: 'system', label: 'System' },
                        { id: 'light', label: 'Light' },
                        { id: 'dark', label: 'Dark' },
                      ] as const
                    ).map((opt) => {
                      const on = settings.themeMode === opt.id;
                      return (
                        <Pressable
                          key={opt.id}
                          onPress={() => void setThemeMode(opt.id)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
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
                    System follows your phone's light or dark setting.
                  </ThemedText>
                </View>
                <View style={[styles.divider, { backgroundColor: hairline }]} />
                <Row
                  label="Health Connect"
                  detail={hcNote ?? 'Reads activity on this phone only. Never uploaded.'}
                  value={hcOn}
                  onValueChange={(v) => {
                    void toggleHealthConnect(v);
                  }}
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
                      {...keyboard.field('reminderTime')}
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
              HELP
            </ThemedText>
            <Pressable
              onPress={() => router.push({ pathname: '/home', params: { tour: '1' } })}
              accessibilityRole="button"
              accessibilityLabel="Replay the app tour"
              style={({ pressed }) => [styles.helpRow, pressed && styles.pressed]}
            >
              <View style={styles.helpText}>
                <ThemedText type="smallBold">Replay the app tour</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  A quick reminder of where things live
                </ThemedText>
              </View>
              <Text style={[styles.helpChevron, { color: accent }]}>›</Text>
            </Pressable>
          </View>

          <View style={[styles.card, { backgroundColor: cardBg, borderColor: hairline }]}>
            <ThemedText type="smallBold" style={styles.cardLabel}>
              YOUR DATA
            </ThemedText>
            {exportSummary ? (
              <ThemedText type="small" themeColor="textSecondary">
                {exportSummary}
              </ThemedText>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                Everything is stored on this device only.
              </ThemedText>
            )}
            <View style={styles.exportRow}>
              <Pressable
                onPress={() => void runExport('backup')}
                disabled={exportBusy !== null}
                accessibilityRole="button"
                accessibilityLabel="Export a JSON backup"
                style={({ pressed }) => [
                  styles.exportButton,
                  { borderColor: hairline },
                  pressed && styles.pressed,
                  exportBusy && exportBusy !== 'backup' && styles.exportDisabled,
                ]}
              >
                <Text style={[styles.exportButtonText, { color: accent }]}>
                  {exportBusy === 'backup' ? 'Preparing…' : 'Backup (JSON)'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void runExport('diary')}
                disabled={exportBusy !== null}
                accessibilityRole="button"
                accessibilityLabel="Export the food diary as CSV"
                style={({ pressed }) => [
                  styles.exportButton,
                  { borderColor: hairline },
                  pressed && styles.pressed,
                  exportBusy && exportBusy !== 'diary' && styles.exportDisabled,
                ]}
              >
                <Text style={[styles.exportButtonText, { color: accent }]}>
                  {exportBusy === 'diary' ? 'Preparing…' : 'Diary (CSV)'}
                </Text>
              </Pressable>
            </View>
            {exportNote ? (
              <ThemedText type="small" themeColor="textSecondary">
                {exportNote}
              </ThemedText>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                Backup = everything (profile, diary, water, weigh-ins, workouts, saved meals). Diary = spreadsheet-friendly meal log.
              </ThemedText>
            )}

            {!restore && (
              <View style={styles.restoreButtons}>
                <Pressable
                  onPress={() => void runPickBackup()}
                  disabled={exportBusy !== null || restoreBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Restore from a backup file"
                  style={({ pressed }) => [
                    styles.restoreButton,
                    { borderColor: hairline },
                    pressed && styles.pressed,
                    (exportBusy || restoreBusy) && styles.exportDisabled,
                  ]}
                >
                  <Text style={[styles.exportButtonText, { color: accent }]}>
                    {restoreBusy ? 'Looking for the file…' : 'Restore from a backup…'}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => void runPickDiary()}
                  disabled={exportBusy !== null || restoreBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Import a diary from another app"
                  style={({ pressed }) => [
                    styles.restoreButton,
                    { borderColor: hairline },
                    pressed && styles.pressed,
                    (exportBusy || restoreBusy) && styles.exportDisabled,
                  ]}
                >
                  <Text style={[styles.exportButtonText, { color: accent }]}>Import from another app…</Text>
                </Pressable>
                <ThemedText type="small" themeColor="textSecondary">
                  Brings your diary across from a MyFitnessPal or Cronometer CSV — worth doing before you
                  stop paying for the old one.
                </ThemedText>
              </View>
            )}

            {restore && (
              <View style={[styles.restorePreview, { borderColor: hairline }]}>
                <ThemedText type="smallBold">{restore.title}</ThemedText>

                {restore.dateOrder && (
                  <Pressable
                    onPress={() => void swapDateOrder()}
                    disabled={restoreBusy}
                    accessibilityRole="button"
                    accessibilityLabel="Switch between day-first and month-first dates"
                    style={({ pressed }) => [styles.restoreOption, pressed && styles.pressed]}
                  >
                    <Text style={[styles.restoreDot, { color: accent }]}>⇄</Text>
                    <View style={styles.flex}>
                      <ThemedText type="small" themeColor="textSecondary">
                        Dates read as {restore.dateOrder === 'mdy' ? 'M/D/Y' : 'D/M/Y'}. Tap to switch — check
                        a day you remember logging on.
                      </ThemedText>
                    </View>
                  </Pressable>
                )}

                {restore.kind === 'import' && (
                  <ThemedText type="small" themeColor="textSecondary">
                    These days are added to the diary you already have, not swapped for it — a diary
                    import has no weigh-ins or workouts to replace yours with.
                  </ThemedText>
                )}

                {(restore.kind === 'import' ? (['merge'] as const) : (['merge', 'replace'] as const)).map((mode) => {
                  const plan = mode === 'replace' ? restore.replace : restore.merge;
                  const selected = restoreMode === mode;
                  return (
                    <Pressable
                      key={mode}
                      onPress={() => setRestoreMode(mode)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={mode === 'merge' ? 'Add to my data' : 'Replace everything'}
                      style={({ pressed }) => [styles.restoreOption, pressed && styles.pressed]}
                    >
                      <Text style={[styles.restoreDot, { color: selected ? accent : theme.textSecondary }]}>
                        {selected ? '●' : '○'}
                      </Text>
                      <View style={styles.flex}>
                        <ThemedText type="smallBold" style={selected ? { color: accent } : undefined}>
                          {mode === 'merge' ? 'Add to my data' : 'Replace everything'}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {describePlan(plan)}
                        </ThemedText>
                      </View>
                    </Pressable>
                  );
                })}

                {(() => {
                  const plan = restoreMode === 'replace' ? restore.replace : restore.merge;
                  const notes = describePlanNotes(plan, [...restore.notes, ...restore.warnings]);
                  return notes ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {notes}
                    </ThemedText>
                  ) : null;
                })()}

                <View style={styles.exportRow}>
                  <Pressable
                    onPress={() => setRestore(null)}
                    disabled={restoreBusy}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel the restore"
                    style={({ pressed }) => [styles.exportButton, { borderColor: hairline }, pressed && styles.pressed]}
                  >
                    <Text style={[styles.exportButtonText, { color: accent }]}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void confirmRestore()}
                    disabled={restoreBusy}
                    accessibilityRole="button"
                    accessibilityLabel={restoreMode === 'replace' ? 'Replace everything with this file' : 'Add this file'}
                    style={({ pressed }) => [styles.exportButton, { borderColor: hairline }, pressed && styles.pressed]}
                  >
                    <Text style={[styles.exportButtonText, { color: accent }]}>
                      {restoreBusy ? 'Working…' : restoreMode === 'replace' ? 'Replace everything' : 'Add to my data'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>

          <ThemedText type="small" themeColor="textSecondary" style={styles.footerNote}>
            {COFID_CREDIT}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.footerNote}>
            calibrEAT will never store or sell your data. We believe in privacy for our users.
          </ThemedText>
          {keyboard.bottomInset > 0 ? <View style={{ height: keyboard.bottomInset }} /> : null}
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
  helpRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: 6 },
  helpText: { flex: 1, gap: 2 },
  helpChevron: { fontSize: 22, fontWeight: '700' },
  timeInput: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16, fontWeight: '700', letterSpacing: 0.6, maxWidth: 120 },
  freqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  freqChip: { borderWidth: 1.5, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 },
  freqChipText: { fontSize: 12, fontWeight: '800' },
  exportRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  exportButton: { borderWidth: 1.5, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16, flexGrow: 1 },
  exportButtonText: { fontSize: 13, fontWeight: '800' },
  exportDisabled: { opacity: 0.5 },
  restoreButtons: { gap: 10 },
  restoreButton: { borderWidth: 1.5, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' },
  restorePreview: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  restoreOption: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  restoreDot: { fontSize: 16, lineHeight: 20 },
  footerNote: { textAlign: 'center', lineHeight: 17, paddingHorizontal: Spacing.three },
  pressed: { opacity: 0.65 },
});
