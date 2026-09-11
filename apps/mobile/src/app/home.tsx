import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { BrandMark } from '@/components/brand-mark';
import { CrispPress } from '@/components/crisp-press';
import { EatTrainSwitch } from '@/components/eat-train-switch';
import { HeaderGlyphButton, StreakFireMark, WaterDropMark } from '@/components/header-glyphs';
import { LicenseSheet } from '@/components/license-sheet';
import { MealLogSheet } from '@/components/meal-log-sheet';
import { StreakSheet, WeekPips } from '@/components/streak-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WaterSheet } from '@/components/water-sheet';
import { Brand } from '@/constants/app';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import {
  addLogEntry,
  addWaterForDay,
  addWeighIn,
  deleteLogEntry,
  getGoals,
  getIntakeHistory,
  getLogsForDay,
  getProfile,
  getRecents,
  getUnitPrefs,
  getWaterForDay,
  getWeighIns,
  getWorkoutKcalForDay,
  saveUnitPrefs,
  setWaterForDay,
  updateLogEntry,
  type Goals,
  type LogEntry,
  type LogInput,
  type Profile,
  type RecentMeal,
} from '@/lib/db';
import { sumDayMacros } from '@/lib/diary';
import { adaptiveHistory, adaptiveTdee, calorieBudget, caloriesRemaining, detectPlateau } from '@/lib/nutrition';
import { getCalorieOverride, getTrueBurnState, saveTrueBurnState, setCalorieOverride, shouldShowAdoptPrompt, type TrueBurnState } from '@/lib/trueburn';
import { useLicense } from '@/lib/license-context';
import { getVerifiedEmail } from '@/lib/license';
import { claimStreak, emptyStreak, expireStreak, streakNeedsClaim, weekPips, type StreakState } from '@/lib/streak';
import { loadStreak, saveStreak } from '@/lib/streak-store';
import { CUP_ML, waterToMl, type WaterUnit } from '@/lib/units';

function formatISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function isToday(date: Date): boolean {
  const now = new Date();
  return date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

function startOfMonth(d: Date): Date {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function HomeScreen() {
  const { license, deactivate } = useLicense();
  const router = useRouter();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const theme = useTheme();

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bootTick, setBootTick] = useState(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [waterMl, setWaterMl] = useState(0);
  const [addingWater, setAddingWater] = useState(false);
  const [waterInput, setWaterInput] = useState('');
  const [waterUnit, setWaterUnit] = useState<WaterUnit>('ml');
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(() => startOfMonth(new Date()));
  const [showMenu, setShowMenu] = useState(false);
  const [showLicense, setShowLicense] = useState(false);
  const [showWater, setShowWater] = useState(false);
  const [showStreak, setShowStreak] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [streak, setStreak] = useState<StreakState>(emptyStreak);
  const [editWaterValue, setEditWaterValue] = useState('');
  const [savingWaterEdit, setSavingWaterEdit] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [recents, setRecents] = useState<RecentMeal[]>([]);
  const [showLogSheet, setShowLogSheet] = useState(false);
  const [editingLog, setEditingLog] = useState<LogEntry | null>(null);
  const [weighInInput, setWeighInInput] = useState('');
  const [addingWeighIn, setAddingWeighIn] = useState(false);
  const [weighIns, setWeighIns] = useState<{ kg: number; measuredAt: string }[]>([]);
  const [intakeHistory, setIntakeHistory] = useState<{ dayKey: string; kcal: number }[]>([]);
  const [workoutKcal, setWorkoutKcal] = useState(0);
  const [trueBurnPersist, setTrueBurnPersist] = useState<TrueBurnState>({});
  const [overrideKcal, setOverrideKcal] = useState<number | null>(null);
  const [trueBurnActionBusy, setTrueBurnActionBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const waterPulse = useRef(new Animated.Value(0)).current;

  const selectedKey = formatISO(selectedDate);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, g, prefs, tb, ov, st, email] = await Promise.all([
          getProfile(),
          getGoals(),
          getUnitPrefs(),
          getTrueBurnState(),
          getCalorieOverride(),
          loadStreak(),
          getVerifiedEmail(),
        ]);
        if (cancelled) return;
        const nextStreak = expireStreak(st, Date.now());
        if (
          nextStreak.current !== st.current ||
          nextStreak.best !== st.best ||
          nextStreak.lastClaimedAt !== st.lastClaimedAt ||
          nextStreak.lastClaimedDayKey !== st.lastClaimedDayKey
        ) {
          await saveStreak(nextStreak);
        }
        setProfile(p);
        setGoals(g);
        setWaterUnit(prefs.water);
        setTrueBurnPersist(tb);
        setOverrideKcal(ov);
        setStreak(nextStreak);
        setVerifiedEmail(email);
        setLoadError(null);
      } catch {
        if (!cancelled) setLoadError('Could not open your log. Try again.');
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootTick]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([
        getWaterForDay(selectedKey),
        getLogsForDay(selectedKey),
        getRecents(8),
        getWeighIns(60),
        getIntakeHistory(60),
        getWorkoutKcalForDay(selectedKey),
      ]).then(([w, dayLogs, recentMeals, wi, ih, burn]) => {
        if (cancelled) return;
        setWaterMl(w);
        setLogs(dayLogs);
        setRecents(recentMeals);
        setWeighIns(wi.map((x) => ({ kg: x.kg, measuredAt: x.measuredAt })));
        setIntakeHistory(ih);
        setWorkoutKcal(burn);
      });
      return () => {
        cancelled = true;
      };
    }, [selectedKey]),
  );

  // keep picker month in sync when opening
  useEffect(() => {
    if (showPicker) setPickerMonth(startOfMonth(selectedDate));
  }, [showPicker, selectedDate]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const next = expireStreak(streak, now);
    if (next.current === streak.current) return;
    setStreak(next);
    void saveStreak(next);
  }, [now, streak]);

  // ── All hooks are above; only conditional rendering below. ──
  if (!license) return <Redirect href="/" />;
  if (!loaded) return <ThemedView style={styles.container} />;
  if (loadError) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
          <View style={[styles.scrollContent, { justifyContent: 'center' }]}>
            <ThemedText type="title">Could not open your log</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {loadError}
            </ThemedText>
            <Pressable
              onPress={() => {
                setLoaded(false);
                setBootTick((n) => n + 1);
              }}
              style={({ pressed }) => [
                styles.waterAddButton,
                { backgroundColor: Brand.primaryDeep, alignSelf: 'flex-start' },
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.waterAddText}>Try again</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }
  if (profile === null) return <Redirect href="/setup" />;

  const waterGoal = 4000;

  const adaptive = (() => {
    if (!goals || !profile) return null;
    return adaptiveTdee({
      estimatedTdee: goals.tdee,
      weighIns: weighIns.map((w) => ({ kg: w.kg, at: w.measuredAt })),
      intakeByDay: intakeHistory,
      goal: profile.goal,
      ratePerWeek: profile.ratePerWeek,
    });
  })();

  const burnHistory = (() => {
    if (!goals || !profile || weighIns.length < 2) return [];
    return adaptiveHistory({
      estimatedTdee: goals.tdee,
      weighIns: weighIns.map((w) => ({ kg: w.kg, at: w.measuredAt })),
      intakeByDay: intakeHistory,
      goal: profile.goal,
      ratePerWeek: profile.ratePerWeek,
    });
  })();

  const plateau = (() => {
    if (!adaptive) return null;
    return detectPlateau({ weighIns: weighIns.map((w) => ({ kg: w.kg, at: w.measuredAt })), intakeByDay: intakeHistory, adaptive });
  })();

  const dayMacros = sumDayMacros(logs);
  const intakeKcal = dayMacros.kcal;
  // Adopted measured target overrides dial until profile is re-saved in setup
  const dialTarget = (() => {
    if (overrideKcal != null) return overrideKcal;
    if (adaptive?.ready && adaptive.suggestedTarget) return adaptive.suggestedTarget;
    return goals?.calorieTarget ?? 2000;
  })();
  const budget = calorieBudget(dialTarget, workoutKcal);
  const dialMeasuredLabel = adaptive?.ready ? `Measured burn ${adaptive.measuredTdee?.toLocaleString()} kcal` : null;
  const showAdoptPrompt = !!adaptive?.ready && adaptive.suggestedTarget != null && overrideKcal == null && shouldShowAdoptPrompt(trueBurnPersist, adaptive.suggestedTarget);

  async function handleAdoptBurn() {
    if (!adaptive?.suggestedTarget || trueBurnActionBusy) return;
    setTrueBurnActionBusy(true);
    try {
      const v = adaptive.suggestedTarget;
      await setCalorieOverride(v);
      await saveTrueBurnState({ ...trueBurnPersist, lastSeenSuggested: v, decision: 'adopt', adoptedSuggested: v, dismissedAt: null });
      setOverrideKcal(v);
      setTrueBurnPersist({ ...trueBurnPersist, lastSeenSuggested: v, decision: 'adopt', adoptedSuggested: v, dismissedAt: null });
    } finally {
      setTrueBurnActionBusy(false);
    }
  }

  async function handleKeepBurn() {
    if (!adaptive?.suggestedTarget || trueBurnActionBusy) return;
    setTrueBurnActionBusy(true);
    try {
      const v = adaptive.suggestedTarget;
      await saveTrueBurnState({ ...trueBurnPersist, lastSeenSuggested: v, decision: 'keep', dismissedAt: new Date().toISOString() });
      setTrueBurnPersist({ ...trueBurnPersist, lastSeenSuggested: v, decision: 'keep', dismissedAt: new Date().toISOString() });
    } finally {
      setTrueBurnActionBusy(false);
    }
  }

  async function handleRevertBurn() {
    if (trueBurnActionBusy) return;
    setTrueBurnActionBusy(true);
    try {
      await setCalorieOverride(null);
      await saveTrueBurnState({ ...trueBurnPersist, decision: null, adoptedSuggested: null, dismissedAt: null });
      setOverrideKcal(null);
      setTrueBurnPersist({ ...trueBurnPersist, decision: null, adoptedSuggested: null, dismissedAt: null });
    } finally {
      setTrueBurnActionBusy(false);
    }
  }

  async function refreshLogs() {
    const [dayLogs, recentMeals, history] = await Promise.all([getLogsForDay(selectedKey), getRecents(8), getIntakeHistory(60)]);
    setLogs(dayLogs);
    setRecents(recentMeals);
    setIntakeHistory(history);
  }

  function openNewLog() {
    setEditingLog(null);
    setShowLogSheet(true);
  }

  async function handleSaveLog(input: LogInput) {
    if (editingLog) {
      await updateLogEntry(editingLog.id, input);
    } else {
      await addLogEntry(input);
    }
    await refreshLogs();
  }

  async function handleDeleteLog(id: number) {
    await deleteLogEntry(id);
    await refreshLogs();
  }

  async function handleAddWeighIn() {
    const v = parseFloat(weighInInput.replace(',', '.'));
    if (!Number.isFinite(v) || v < 20 || v > 400) return;
    setAddingWeighIn(true);
    try {
      await addWeighIn(v, selectedDate);
      const wi = await getWeighIns(60);
      setWeighIns(wi.map((x) => ({ kg: x.kg, measuredAt: x.measuredAt })));
      setWeighInInput('');
    } finally {
      setAddingWeighIn(false);
    }
  }

  async function handleAddWater() {
    const amount = parseFloat(waterInput);
    if (addingWater || !Number.isFinite(amount) || amount <= 0) return;
    const ml = waterToMl(amount, waterUnit);
    setAddingWater(true);
    try {
      await addWaterForDay(selectedKey, ml);
      setWaterMl((current) => {
        const next = current + ml;
        setEditWaterValue(waterUnit === 'cups' ? String(Math.round((next / CUP_ML) * 10) / 10) : String(next));
        return next;
      });
      setWaterInput('');
      waterPulse.setValue(1);
      Animated.timing(waterPulse, { toValue: 0, duration: 420, useNativeDriver: true }).start();
    } finally {
      setAddingWater(false);
    }
  }

  function openWater() {
    const display = waterUnit === 'cups' ? String(Math.round((waterMl / CUP_ML) * 10) / 10) : String(waterMl);
    setEditWaterValue(display === '0' ? '' : display);
    setShowWater(true);
  }

  function handleFirePress() {
    setShowStreak(true);
  }

  function handleClaimStreak() {
    const next = claimStreak(streak, Date.now());
    setStreak(next);
    void saveStreak(next);
  }

  async function handleSaveWaterEdit() {
    const raw = editWaterValue.trim();
    if (raw === '') {
      // empty = clear to 0
      setSavingWaterEdit(true);
      try {
        await setWaterForDay(selectedKey, 0);
        setWaterMl(0);
        setShowWater(false);
      } finally {
        setSavingWaterEdit(false);
      }
      return;
    }
    const amount = parseFloat(raw);
    if (!Number.isFinite(amount) || amount < 0) return;
    const ml = waterToMl(amount, waterUnit);
    setSavingWaterEdit(true);
    try {
      await setWaterForDay(selectedKey, ml);
      setWaterMl(ml);
      setShowWater(false);
    } finally {
      setSavingWaterEdit(false);
    }
  }

  function confirmDeactivate() {
    const message =
      'Remove the license from this device? You can unlock on a new phone with the same email and code. Stay online so the slot actually frees.';
    const doIt = () => {
      void (async () => {
        const result = await deactivate();
        if (result.ok) return;
        if (Platform.OS === 'web') {
          const g = globalThis as typeof globalThis & { alert?: (msg: string) => void };
          g.alert?.(result.message);
          return;
        }
        Alert.alert("Couldn't deactivate", result.message);
      })();
    };
    if (Platform.OS === 'web') {
      const g = globalThis as typeof globalThis & { confirm?: (prompt: string) => boolean };
      if (g.confirm?.(message) ?? true) doIt();
    } else {
      Alert.alert('Deactivate calibrEAT?', message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Deactivate', style: 'destructive', onPress: doIt },
      ]);
    }
  }

  const accentText = isDark ? Brand.lime : Brand.primaryDeep;
  const accentSoft = isDark ? 'rgba(183,233,60,0.08)' : 'rgba(31,157,85,0.08)';
  const hairline = theme.line;
  const mutedTrack = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(13,21,30,0.08)';
  const cardBg = isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF';

  const caloriesPct = budget ? Math.min(1, intakeKcal / budget) : 0;
  const waterPct = Math.min(1, waterMl / waterGoal);

  // calendar math — build explicit week rows so columns stay aligned
  const todayKey = formatISO(new Date());
  const fireLive = streakNeedsClaim(streak, now);
  const licenseEmail = license.customerEmail ?? verifiedEmail ?? '—';
  const year = pickerMonth.getFullYear();
  const month = pickerMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay(); // 0 Sun
  const firstCol = (firstWeekday + 6) % 7; // 0 Mon ... 6 Sun
  const weeks: (number | null)[][] = (() => {
    const out: (number | null)[][] = [];
    let cur: (number | null)[] = Array.from({ length: firstCol }, () => null);
    for (let d = 1; d <= daysInMonth; d += 1) {
      cur.push(d);
      if (cur.length === 7) {
        out.push(cur);
        cur = [];
      }
    }
    if (cur.length) {
      while (cur.length < 7) cur.push(null);
      out.push(cur);
    }
    return out;
  })();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Header: wordmark + calibration badge ────────────── */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <BrandMark size={28} />
              <View style={styles.livePill}>
                <View style={styles.liveDot} />
                <ThemedText type="smallBold" style={styles.liveText}>
                  INSTRUMENT ACTIVE
                </ThemedText>
              </View>
            </View>
            <View style={styles.headerRight}>
              <HeaderGlyphButton label="Daily streak" onPress={handleFirePress} borderColor={hairline} backgroundColor={cardBg}>
                <StreakFireMark live={fireLive} count={streak.current} color={fireLive ? '#EA580C' : '#9A3412'} />
              </HeaderGlyphButton>
              <HeaderGlyphButton label="Add water" onPress={openWater} borderColor={hairline} backgroundColor={cardBg}>
                <WaterDropMark fill={waterPct} color={isDark ? '#38BDF8' : '#0284C7'} />
              </HeaderGlyphButton>
              <Pressable
              onPress={() => setShowMenu(true)}
              hitSlop={8}
              style={({ pressed }) => [styles.menuBtn, { borderColor: hairline, backgroundColor: cardBg }, pressed && styles.pressed]}
            >
              <View style={styles.menuLine} />
              <View style={styles.menuLine} />
              <View style={styles.menuLine} />
            </Pressable>
            </View>
          </View>

          <EatTrainSwitch
            value="eat"
            isDark={isDark}
            onChange={(mode) => {
              if (mode === 'train') router.replace('/train');
            }}
          />

          <View style={styles.dateRow}>
            <Pressable
              onPress={() => setShowPicker((v) => !v)}
              style={({ pressed }) => [styles.datePress, pressed && styles.pressed]}
            >
              <View style={[styles.calendarIconWrap, { backgroundColor: accentSoft, borderColor: accentText }]}>
                <View style={[styles.calIconTopSolid, { backgroundColor: accentText }]} />
                <Text style={[styles.calIconTextSolid, { color: accentText }]}>{String(selectedDate.getDate())}</Text>
              </View>
              <ThemedText type="smallBold" style={styles.dateText}>
                {isToday(selectedDate)
                  ? `Today — ${formatToday()}`
                  : selectedDate.toLocaleDateString(undefined, {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
              </ThemedText>
            </Pressable>
          </View>
          <View style={styles.todayStrip}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.todayStripText}>
              {logs.length} locked
            </ThemedText>
            <View style={[styles.todayStripDot, { backgroundColor: theme.muted }]} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.todayStripText}>
              {Math.round((waterMl / 100)) / 10} / 4 L
            </ThemedText>
            <View style={[styles.todayStripDot, { backgroundColor: theme.muted }]} />
            <WeekPips
              lit={weekPips(streak.current)}
              color={accentText}
              dim={isDark ? 'rgba(255,255,255,0.14)' : 'rgba(13,21,30,0.12)'}
            />
          </View>
          <Modal
            visible={showPicker}
            transparent
            animationType="fade"
            onRequestClose={() => setShowPicker(false)}
          >
            <Pressable style={styles.modalOverlay} onPress={() => setShowPicker(false)}>
              <View style={styles.modalWrap}>
                <Pressable onPress={() => {}} style={[styles.pickerCard, { backgroundColor: isDark ? '#131F2E' : '#FFFFFF', borderColor: isDark ? 'rgba(255,255,255,0.12)' : hairline }]}>
                  <View style={[styles.pickerHandle, { backgroundColor: isDark ? '#FFFFFF' : '#0A1019' }]} />
                  <View style={styles.calHeader}>
                    <Pressable
                      onPress={() => setPickerMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                      hitSlop={8}
                      style={({ pressed }) => [styles.calNav, pressed && styles.pressed]}
                    >
                      <Text style={[styles.calNavText, { color: accentText }]}>‹</Text>
                    </Pressable>
                    <ThemedText type="smallBold" style={styles.calTitle}>
                      {pickerMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                    </ThemedText>
                    {(() => {
                      const now = new Date();
                      const canGoNext = new Date(year, month + 1, 1) <= new Date(now.getFullYear(), now.getMonth(), 1);
                      return (
                        <Pressable
                          disabled={!canGoNext}
                          hitSlop={8}
                          onPress={() => canGoNext && setPickerMonth(new Date(year, month + 1, 1))}
                          style={[styles.calNav, !canGoNext && styles.calNavDisabled]}
                        >
                          <Text style={[styles.calNavText, { color: canGoNext ? accentText : theme.muted, opacity: canGoNext ? 1 : 0.45 }]}>›</Text>
                        </Pressable>
                      );
                    })()}
                  </View>
                  <View style={[styles.calDivider, { backgroundColor: hairline }]} />
                  <View style={styles.calWeekRow}>
                    {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => (
                      <View key={`${w}-${i}`} style={styles.calWeekdayWrap}>
                        <ThemedText type="smallBold" style={[styles.calWeekday, { color: theme.muted }]}>
                          {w}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                  <View style={styles.calGrid}>
                    {weeks.map((week, wi) => (
                      <View key={`w-${wi}`} style={styles.calWeek}>
                        {week.map((day, di) => {
                          if (day === null) return <View key={`b-${wi}-${di}`} style={[styles.calCell, styles.calDay]} />;
                          const d = new Date(year, month, day);
                          d.setHours(0, 0, 0, 0);
                          const key = formatISO(d);
                          const active = key === selectedKey;
                          const isFuture = key > todayKey;
                          const isTodayCell = key === todayKey;
                          return (
                            <Pressable
                              key={key}
                              disabled={isFuture}
                              onPress={() => {
                                setSelectedDate(d);
                                setShowPicker(false);
                              }}
                              style={({ pressed }) => [
                                styles.calCell,
                                styles.calDay,
                                active && { backgroundColor: accentText, borderColor: accentText },
                                isTodayCell && !active && { borderColor: accentText },
                                isFuture && styles.calFuture,
                                pressed && !isFuture && styles.pressed,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.calDayText,
                                  { color: active ? (isDark ? '#0A1019' : '#fff') : isFuture ? theme.muted : theme.text },
                                  isFuture && styles.calFutureText,
                                ]}
                              >
                                {day}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ))}
                  </View>
                  <View style={styles.calFooter}>
                    <Pressable
                      onPress={() => {
                        const t = new Date();
                        t.setHours(0, 0, 0, 0);
                        setSelectedDate(t);
                        setPickerMonth(startOfMonth(t));
                        setShowPicker(false);
                      }}
                      style={({ pressed }) => [styles.calTodayBtn, { borderColor: hairline }, pressed && styles.pressed]}
                    >
                      <ThemedText type="smallBold" style={{ color: accentText }}>
                        Today
                      </ThemedText>
                    </Pressable>
                    <Pressable onPress={() => setShowPicker(false)} style={({ pressed }) => [styles.pickerDone, pressed && styles.pressed]}>
                      <ThemedText type="smallBold" style={{ color: accentText }}>
                        Done
                      </ThemedText>
                    </Pressable>
                  </View>
                </Pressable>
              </View>
            </Pressable>
          </Modal>

          {/* ── HERO: calibration dial ──────────────────────────── */}
          <View style={[styles.dialCard, { backgroundColor: cardBg, borderColor: isDark ? 'rgba(183,233,60,0.22)' : 'rgba(31,157,85,0.28)', shadowColor: isDark ? Brand.lime : Brand.primaryDeep }]}>
            <View
              style={[
                styles.dialVignette,
                {
                  backgroundColor: isDark ? 'rgba(183,233,60,0.04)' : 'rgba(31,157,85,0.04)',
                },
              ]}
            />
            <View style={styles.dialHead}>
              <ThemedText type="smallBold" style={styles.dialLabel}>
                DAILY CALIBRATION
              </ThemedText>
              <Pressable
                onPress={openNewLog}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Log a meal"
                style={({ pressed }) => [styles.dialAdd, { borderColor: accentText, backgroundColor: accentSoft }, pressed && styles.pressed]}
              >
                <View style={styles.plusMark} pointerEvents="none">
                  <View style={[styles.plusBarH, { backgroundColor: accentText }]} />
                  <View style={[styles.plusBarV, { backgroundColor: accentText }]} />
                </View>
              </Pressable>
            </View>
            <Pressable onPress={openNewLog} style={({ pressed }) => [pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Log a meal">
              <View style={styles.dialStage}>
                <CalibrationDial
                  value={intakeKcal}
                  target={budget}
                  pct={caloriesPct}
                  track={mutedTrack}
                  accent={isDark ? Brand.lime : Brand.primary}
                  accentText={accentText}
                  isDark={isDark}
                />
              </View>
            </Pressable>
            {(() => {
              const remain = caloriesRemaining({ target: dialTarget, foodKcal: intakeKcal, workoutKcal });
              return (
                <>
                  <Text style={[styles.dialRemain, { color: remain < 0 ? Brand.danger : accentText }]}>
                    {remain >= 0 ? `${remain.toLocaleString()} left` : `${Math.abs(remain).toLocaleString()} over`}
                  </Text>
                  {workoutKcal > 0 ? (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.dialFoot}>
                      Includes {workoutKcal.toLocaleString()} kcal from Train.
                    </ThemedText>
                  ) : null}
                </>
              );
            })()}
            {adaptive?.ready ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.dialFoot}>
                {dialMeasuredLabel} · est. {adaptive.estimatedTdee.toLocaleString()} · {adaptive.delta && adaptive.delta > 0 ? '+' : ''}{adaptive.delta} kcal · tap dial to log intake.
              </ThemedText>
            ) : (
              <ThemedText type="small" themeColor="textSecondary" style={styles.dialFoot}>
                {intakeKcal === 0 ? 'Nothing logged yet — add your first meal to move the needle.' : `${intakeKcal.toLocaleString()} kcal today · ${adaptive?.reason ?? 'Log weigh-ins for True Burn.'}`}
              </ThemedText>
            )}
          </View>

          {/* ── True Burn Calibration card (Phase A) ────────────── */}
          <View style={[styles.stripCard, { backgroundColor: cardBg, borderColor: hairline }]}>
            <View style={styles.stripHead}>
              <ThemedText type="smallBold" style={styles.stripTitle}>TRUE BURN</ThemedText>
              {adaptive?.ready ? (
                <View style={[styles.badge, { backgroundColor: accentSoft, borderColor: accentText }]}>
                  <Text style={[styles.badgeText, { color: accentText }]}>
                    {(adaptive.confidence ?? 'low').toUpperCase()} · {adaptive.windowDays}d · {adaptive.weighInsUsed} weigh-ins
                  </Text>
                </View>
              ) : (
                <ThemedText type="small" themeColor="textSecondary">Needs data</ThemedText>
              )}
            </View>
            {adaptive?.ready ? (
              <>
                <View style={styles.trueBurnRow}>
                  <View style={styles.trueBurnStat}>
                    <ThemedText type="small" themeColor="textSecondary">Formula</ThemedText>
                    <Text style={[styles.trueBurnNum, { color: theme.text }]}>{adaptive.estimatedTdee.toLocaleString()}</Text>
                  </View>
                  <Text style={[styles.trueBurnArrow, { color: accentText }]}>→</Text>
                  <View style={styles.trueBurnStat}>
                    <ThemedText type="small" themeColor="textSecondary">Measured burn</ThemedText>
                    <Text style={[styles.trueBurnNum, { color: accentText }]}>{adaptive.measuredTdee?.toLocaleString()}</Text>
                  </View>
                  <View style={[styles.trueBurnDelta, { backgroundColor: accentSoft, borderColor: accentText }]}>
                    <Text style={[styles.trueBurnDeltaText, { color: accentText }]}>{adaptive.delta != null && adaptive.delta > 0 ? '+' : ''}{adaptive.delta}</Text>
                  </View>
                </View>
                <View style={[styles.burnBarTrack, { backgroundColor: mutedTrack }]}>
                  <View style={[styles.burnBarEst, { left: '8%', width: '84%', backgroundColor: hairline }]} />
                  {(() => {
                    const est = adaptive.estimatedTdee;
                    const meas = adaptive.measuredTdee ?? est;
                    const lo = Math.min(est, meas) - 120;
                    const hi = Math.max(est, meas) + 120;
                    const span = Math.max(1, hi - lo);
                    const a = Math.max(2, Math.min(96, ((est - lo) / span) * 100));
                    const b = Math.max(2, Math.min(96, ((meas - lo) / span) * 100));
                    const left = Math.min(a, b);
                    const w = Math.abs(b - a);
                    return <View style={[styles.burnBarDrift, { left: `${left}%`, width: `${Math.max(3, w)}%`, backgroundColor: accentText }]} />;
                  })()}
                </View>
                <ThemedText type="small" themeColor="textSecondary" style={styles.cardHint}>
                  {adaptive.confidence === 'high'
                    ? `Strong signal over ${adaptive.windowDays}d (${adaptive.loggedDays ?? adaptive.windowDays} logged) — measured burn is trusted.`
                    : adaptive.confidence === 'medium'
                      ? `Moderate signal · ${adaptive.loggedDays ?? '—'} logged of ${adaptive.windowDays}d — trends stabilizing.`
                      : `Early signal — keep logging and weighing in to tighten the estimate (blended ${(Math.round((adaptive.blend ?? 0) * 100))}% toward formula).`}
                </ThemedText>
                {burnHistory.length >= 2 ? (
                  <BurnSparkline points={burnHistory.map((p) => p.measuredTdee)} est={adaptive.estimatedTdee} accentText={accentText} muted={theme.muted} track={mutedTrack} />
                ) : null}
                {plateau?.isPlateau ? (
                  <View style={[styles.plateauWrap, { borderColor: 'rgba(239,68,68,0.28)', backgroundColor: isDark ? 'rgba(239,68,68,0.10)' : 'rgba(239,68,68,0.06)' }]}>
                    <Text style={styles.plateauDot}>●</Text>
                    <ThemedText type="small" style={{ flex: 1, lineHeight: 17 }}>{plateau.message}</ThemedText>
                  </View>
                ) : null}
                {showAdoptPrompt ? (
                  <View style={styles.adoptRow}>
                    <CrispPress onPress={handleKeepBurn} disabled={trueBurnActionBusy} innerStyle={[styles.adoptGhost, { borderColor: hairline }]}>
                      <Text style={[styles.adoptGhostText, { color: theme.muted }]}>Keep {goals?.calorieTarget.toLocaleString()} kcal</Text>
                    </CrispPress>
                    <CrispPress onPress={handleAdoptBurn} disabled={trueBurnActionBusy} innerStyle={[styles.adoptPrimary, { backgroundColor: accentText }]}>
                      <Text style={[styles.adoptPrimaryText, { color: isDark ? '#0A1019' : '#fff' }]}>Adopt {adaptive.suggestedTarget?.toLocaleString()} kcal</Text>
                    </CrispPress>
                  </View>
                ) : overrideKcal != null ? (
                  <View style={styles.adoptRow}>
                    <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>Dial using adopted {overrideKcal.toLocaleString()} kcal</ThemedText>
                    <CrispPress onPress={handleRevertBurn} disabled={trueBurnActionBusy} innerStyle={[styles.adoptGhost, { borderColor: hairline }]}>
                      <Text style={[styles.adoptGhostText, { color: theme.muted }]}>Revert</Text>
                    </CrispPress>
                  </View>
                ) : null}
                <ThemedText type="small" themeColor="textSecondary" style={styles.cardHint}>
                  Inferred from weight vs intake. {overrideKcal != null ? 'Adopted target drives the dial.' : showAdoptPrompt ? 'Tap Adopt to drive the dial with measured burn.' : 'Keep or Adopt — never auto-changes.'}
                </ThemedText>
              </>
            ) : (
              <ThemedText type="small" themeColor="textSecondary" style={styles.cardHint}>
                {adaptive?.reason ?? 'Log weigh-ins and daily intake for a week to unlock your measured burn.'} Until then the dial uses your formula target — every other app trusts it forever.
              </ThemedText>
            )}
          </View>

          {/* ── MACRO ARCS — tappable to full nutrient list ─────── */}
          {goals ? (
            <Pressable onPress={() => router.push({ pathname: '/macros', params: { day: selectedKey } })} style={({ pressed }) => [pressed && styles.pressed]}>
              <View style={[styles.stripCard, { backgroundColor: cardBg, borderColor: hairline }]}>
                <View style={styles.stripHead}>
                  <ThemedText type="smallBold" style={styles.stripTitle}>
                    MACRO CALIBRATION
                  </ThemedText>
                  <ThemedText type="smallBold" style={[styles.stripLink, { color: accentText }]}>
                    Macros & fibre ›
                  </ThemedText>
                </View>
                <View style={styles.arcRow}>
                  <ArcGauge label="Protein" grams={dayMacros.proteinG} target={goals.proteinG} pct={goals.proteinG ? Math.min(1, dayMacros.proteinG / goals.proteinG) : 0} color="#1F9D55" isDark={isDark} track={mutedTrack} />
                  <ArcGauge label="Carbs" grams={dayMacros.carbsG} target={goals.carbsG} pct={goals.carbsG ? Math.min(1, dayMacros.carbsG / goals.carbsG) : 0} color={isDark ? '#B7E93C' : '#0E6B38'} isDark={isDark} track={mutedTrack} />
                  <ArcGauge label="Fat" grams={dayMacros.fatG} target={goals.fatG} pct={goals.fatG ? Math.min(1, dayMacros.fatG / goals.fatG) : 0} color={isDark ? '#4ADE80' : '#16A34A'} isDark={isDark} track={mutedTrack} />
                </View>
              </View>
            </Pressable>
          ) : null}

          {/* ── WEIGHT ─────────────────────────────────────────── */}
          <View style={[styles.stripCard, styles.weightCard, { backgroundColor: cardBg, borderColor: hairline }]}>
            <ThemedText type="smallBold" style={styles.stripTitle}>
              WEIGHT
            </ThemedText>
            <View style={styles.weightReadout}>
              <Text style={[styles.weightBig, { color: accentText }]}>{weighIns.length ? weighIns[weighIns.length - 1]!.kg : profile.weightKg}</Text>
              <Text style={[styles.weightUnit, { color: theme.textSecondary }]}>kg</Text>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {weighIns.length ? `latest · ${weighIns.length} weigh-ins` : 'start weight'}
            </ThemedText>
            <View style={[styles.horizonTrack, { backgroundColor: mutedTrack }]}>
              <View style={[styles.horizonFill, { backgroundColor: accentText, width: '44%' }]} />
            </View>
            <View style={[styles.waterInputRowFull, { marginTop: 8 }]}>
              <TextInput
                value={weighInInput}
                onChangeText={(t) => setWeighInInput(t.replace(/[^0-9.]/g, ''))}
                placeholder="kg"
                placeholderTextColor={theme.muted}
                keyboardType="numeric"
                returnKeyType="done"
                onSubmitEditing={handleAddWeighIn}
                style={[styles.waterInputField, { color: theme.text, backgroundColor: isDark ? '#0C1420' : '#FFFFFF', borderColor: weighInInput.length ? accentText : hairline }]}
              />
              <Pressable onPress={handleAddWeighIn} disabled={addingWeighIn || !weighInInput.trim()} style={({ pressed }) => [styles.waterAddButton, { backgroundColor: accentText }, pressed && styles.pressed, (addingWeighIn || !weighInInput.trim()) && styles.buttonDimmed]}>
                <Text style={[styles.waterAddText, { color: isDark ? '#0A1019' : '#fff' }]}>{addingWeighIn ? '…' : 'Weigh in'}</Text>
              </Pressable>
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.cardHint}>
              Logged to {isToday(selectedDate) ? 'today' : formatISO(selectedDate)}. After 7 days + 2 weigh-ins, True Burn activates.
            </ThemedText>
          </View>
        </ScrollView>

      </SafeAreaView>

          <WaterSheet
            visible={showWater}
            onClose={() => setShowWater(false)}
            dayLabel={isToday(selectedDate) ? 'TODAY' : formatISO(selectedDate)}
            waterMl={waterMl}
            waterGoal={waterGoal}
            waterUnit={waterUnit}
            waterInput={waterInput}
            onWaterInput={(text) => setWaterInput(text.replace(/[^0-9.]/g, ''))}
            onAdd={() => void handleAddWater()}
            adding={addingWater}
            onUnit={(unit) => {
              setWaterUnit(unit);
              void getUnitPrefs().then((prefs) => saveUnitPrefs({ ...prefs, water: unit }));
            }}
            editValue={editWaterValue}
            onEditValue={(t) => setEditWaterValue(t.replace(/[^0-9.]/g, ''))}
            onSaveTotal={() => void handleSaveWaterEdit()}
            onClear={() => {
              setEditWaterValue('');
              void (async () => {
                setSavingWaterEdit(true);
                try {
                  await setWaterForDay(selectedKey, 0);
                  setWaterMl(0);
                } finally {
                  setSavingWaterEdit(false);
                }
              })();
            }}
            savingEdit={savingWaterEdit}
            isDark={isDark}
            accentText={accentText}
            accentSoft={accentSoft}
            hairline={hairline}
            textColor={theme.text}
            mutedColor={theme.muted}
            cardBg={isDark ? '#131F2E' : '#FFFFFF'}
          />

          <LicenseSheet
            visible={showLicense}
            onClose={() => setShowLicense(false)}
            license={license}
            email={licenseEmail}
            onDeactivate={() => {
              setShowLicense(false);
              confirmDeactivate();
            }}
            isDark={isDark}
            accentText={accentText}
            hairline={hairline}
            textColor={theme.text}
            mutedColor={theme.muted}
            cardBg={isDark ? '#131F2E' : '#FFFFFF'}
          />

          <StreakSheet
            visible={showStreak}
            onClose={() => setShowStreak(false)}
            onClaim={handleClaimStreak}
            streak={streak}
            isDark={isDark}
            accentText={accentText}
            hairline={hairline}
            mutedColor={theme.muted}
            cardBg={isDark ? '#131F2E' : '#FFFFFF'}
          />

          {showLogSheet ? (
            <MealLogSheet
              key={editingLog ? `edit-${editingLog.id}` : 'new'}
              visible
              onClose={() => {
                setShowLogSheet(false);
                setEditingLog(null);
              }}
              dayKey={selectedKey}
              dayLabel={isToday(selectedDate) ? 'TODAY' : formatISO(selectedDate)}
              recents={recents}
              editing={editingLog}
              isDark={isDark}
              accentText={accentText}
              accentSoft={accentSoft}
              hairline={hairline}
              textColor={theme.text}
              mutedColor={theme.muted}
              cardBg={isDark ? '#131F2E' : '#FFFFFF'}
              onSave={handleSaveLog}
              onDelete={handleDeleteLog}
            />
          ) : null}

          <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
            <Pressable style={styles.modalOverlay} onPress={() => setShowMenu(false)}>
              <View style={styles.menuSheetWrap}>
                <Pressable onPress={() => {}} style={[styles.menuSheet, { backgroundColor: isDark ? '#131F2E' : '#FFFFFF', borderColor: isDark ? 'rgba(255,255,255,0.12)' : hairline }]}>
                  <View style={[styles.pickerHandle, { backgroundColor: isDark ? '#FFFFFF' : '#0A1019' }]} />
                  <ThemedText type="smallBold" style={[styles.menuTitle, { color: theme.muted }]}>MENU</ThemedText>
                  <Pressable
                    onPress={() => {
                      setShowMenu(false);
                      router.push('/settings');
                    }}
                    style={({ pressed }) => [styles.menuItem, { borderColor: hairline }, pressed && styles.pressed]}
                  >
                    <ThemedText type="smallBold">Settings</ThemedText>
                    <Text style={[styles.menuChevron, { color: accentText }]}>›</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setShowMenu(false);
                      router.push('/setup');
                    }}
                    style={({ pressed }) => [styles.menuItem, { borderColor: hairline }, pressed && styles.pressed]}
                  >
                    <ThemedText type="smallBold">Adjust my goals</ThemedText>
                    <Text style={[styles.menuChevron, { color: accentText }]}>›</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setShowMenu(false);
                      router.push({ pathname: '/macros', params: { day: selectedKey } });
                    }}
                    style={({ pressed }) => [styles.menuItem, { borderColor: hairline }, pressed && styles.pressed]}
                  >
                    <ThemedText type="smallBold">Nutrients</ThemedText>
                    <Text style={[styles.menuChevron, { color: accentText }]}>›</Text>
                  </Pressable>
                  <ThemedText type="smallBold" style={[styles.menuTitle, { color: theme.muted }]}>
                    TOOLS
                  </ThemedText>
                  <Pressable
                    onPress={() => {
                      setShowMenu(false);
                      router.push('/bmi');
                    }}
                    style={({ pressed }) => [styles.menuItem, { borderColor: hairline }, pressed && styles.pressed]}
                  >
                    <ThemedText type="smallBold">BMI</ThemedText>
                    <Text style={[styles.menuChevron, { color: accentText }]}>›</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setShowMenu(false);
                      setShowLicense(true);
                    }}
                    style={({ pressed }) => [styles.menuItem, { borderColor: hairline }, pressed && styles.pressed]}
                  >
                    <ThemedText type="smallBold">License</ThemedText>
                    <Text style={[styles.menuChevron, { color: accentText }]}>›</Text>
                  </Pressable>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.menuNote}>
                    CalibrEAT will never store or sell your data. We believe in privacy for our users.
                  </ThemedText>
                </Pressable>
              </View>
            </Pressable>
          </Modal>
    </ThemedView>
  );
}

/* ── Instrument primitives ─────────────────────────────────── */

function CalibrationDial({
  value,
  target,
  pct,
  track,
  accent,
  accentText,
  isDark,
}: {
  value: number;
  target: number;
  pct: number;
  track: string;
  accent: string;
  accentText: string;
  isDark: boolean;
}) {
  const size = 190;
  const stroke = 16;
  const radius = (size - stroke) / 2;
  const C = 2 * Math.PI * radius;
  const shown = Math.max(0.02, Math.min(1, pct));
  const dash = `${C * shown} ${C * (1 - shown)}`;
  const mid = size / 2;
  const ticks = Array.from({ length: 20 }, (_, i) => {
    const rad = ((i / 20) * 360 - 90) * (Math.PI / 180);
    return {
      cx: Number((mid + Math.cos(rad) * radius).toFixed(2)),
      cy: Number((mid + Math.sin(rad) * radius).toFixed(2)),
      major: i % 5 === 0,
    };
  });

  return (
    <View style={styles.dialWrap}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={styles.dialSvg}>
        <Defs>
          <LinearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={accent} stopOpacity={isDark ? 1 : 0.95} />
            <Stop offset="1" stopColor={isDark ? '#22c55e' : '#15803d'} />
          </LinearGradient>
        </Defs>
        <Circle cx={mid} cy={mid} r={radius} stroke={track} strokeWidth={stroke} fill="none" />
        <Circle
          cx={mid}
          cy={mid}
          r={radius}
          stroke="url(#grad)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={dash}
          transform={`rotate(-90 ${mid} ${mid})`}
        />
        <Circle cx={mid} cy={mid} r={radius - stroke - 8} fill={isDark ? 'rgba(255,255,255,0.03)' : 'rgba(13,21,30,0.03)'} />
        {ticks.map((t, i) => (
          <Circle
            key={i}
            cx={t.cx}
            cy={t.cy}
            r={t.major ? 2 : 1.15}
            fill={t.major ? accentText : isDark ? '#EEF2F5' : '#0A1019'}
            opacity={t.major ? 0.95 : 0.35}
          />
        ))}
      </Svg>
      <View style={styles.dialCenter} pointerEvents="none">
        <ThemedText type="smallBold" style={styles.dialTarget}>
          {target.toLocaleString()} kcal
        </ThemedText>
        <Text style={[styles.dialValue, { color: accentText }]}>{value.toLocaleString()}</Text>
        <ThemedText type="small" themeColor="textSecondary" style={styles.dialKcal}>
          kcal today
        </ThemedText>
      </View>
    </View>
  );
}

function ArcGauge({
  label,
  grams,
  target,
  pct,
  color,
  isDark,
  track,
}: {
  label: string;
  grams: number;
  target: number;
  pct: number;
  color: string;
  isDark: boolean;
  track: string;
}) {
  const size = 88;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const sweep = 0.74;
  const C = 2 * Math.PI * radius;
  const gap = C * (1 - sweep);
  const seg = C * sweep;
  const shown = Math.max(0.015, Math.min(sweep, pct * sweep));
  const dash = `${C * shown} ${gap + C * (sweep - shown)}`;
  const mid = size / 2;
  return (
    <View style={styles.arcWrap}>
      <View style={styles.arcStage}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={styles.arcSvg}>
          <Circle
            cx={mid}
            cy={mid}
            r={radius}
            stroke={track}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${seg} ${gap}`}
            transform={`rotate(-126 ${mid} ${mid})`}
          />
          <Circle
            cx={mid}
            cy={mid}
            r={radius}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={dash}
            transform={`rotate(-126 ${mid} ${mid})`}
          />
        </Svg>
        <View style={styles.arcCenter} pointerEvents="none">
          <ThemedText type="smallBold" style={styles.arcGrams}>
            {grams}
          </ThemedText>
        </View>
      </View>
      <ThemedText type="smallBold" style={styles.arcLabel}>
        {label}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.arcTarget}>
        / {target}g
      </ThemedText>
    </View>
  );
}

function BurnSparkline({ points, est, accentText, muted, track }: { points: number[]; est: number; accentText: string; muted: string; track: string }) {
  const w = 160;
  const h = 44;
  const pad = 6;
  const all = [...points, est];
  const lo = Math.min(...all) - 40;
  const hi = Math.max(...all) + 40;
  const span = Math.max(1, hi - lo);
  const xs = points.map((_, i) => pad + (i / Math.max(1, points.length - 1)) * (w - pad * 2));
  const ys = points.map((v) => pad + (1 - (v - lo) / span) * (h - pad * 2));
  const estY = pad + (1 - (est - lo) / span) * (h - pad * 2);
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ys[i]!.toFixed(1)}`).join(' ');
  return (
    <View style={styles.sparkWrap}>
      <Svg width={w} height={h}>
        <Defs>
          <LinearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={accentText} stopOpacity={0.22} />
            <Stop offset="1" stopColor={accentText} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Line x1={pad} y1={estY} x2={w - pad} y2={estY} stroke={track} strokeWidth={1} strokeDasharray="4 4" opacity={0.9} />
        {path ? <Path d={`${path} L ${xs[xs.length - 1]!.toFixed(1)} ${h - pad} L ${xs[0]!.toFixed(1)} ${h - pad} Z`} fill="url(#sparkFill)" /> : null}
        {path ? <Path d={path} stroke={accentText} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {xs.map((x, i) => (
          <Circle key={i} cx={x} cy={ys[i]} r={2.5} fill={accentText} />
        ))}
      </Svg>
      <View style={styles.sparkLabels}>
        <ThemedText type="small" style={{ color: muted, fontSize: 10 }}>{lo.toLocaleString()}</ThemedText>
        <ThemedText type="small" style={{ color: muted, fontSize: 10 }}>True Burn drift · formula {est.toLocaleString()} dashed</ThemedText>
      </View>
    </View>
  );
}

function formatToday(): string {
  return new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, overflow: 'visible', zIndex: 2 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexShrink: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8, overflow: 'visible' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, opacity: 0.85 },
  liveDot: { width: 7, height: 7, borderRadius: 7, backgroundColor: '#22c55e' },
  liveText: { fontSize: 10, letterSpacing: 1.1, opacity: 0.75 },
  dateLine: { marginTop: -Spacing.one, opacity: 0.8 },
  dialCard: {
    alignItems: 'center',
    gap: Spacing.two + 2,
    borderRadius: 28,
    borderWidth: 1.5,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three + 2,
    paddingHorizontal: Spacing.three,
    overflow: 'hidden',
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 5,
  },
  dialVignette: {
    ...StyleSheet.absoluteFill,
    borderRadius: 28,
    opacity: 0.5,
  },
  dialLabel: { letterSpacing: 1.4, opacity: 0.7, fontSize: 11 },
  dialHead: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 1 },
  dialAdd: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  plusMark: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  plusBarH: { position: 'absolute', width: 14, height: 2, borderRadius: 1 },
  plusBarV: { position: 'absolute', width: 2, height: 14, borderRadius: 1 },
  dialStage: { alignItems: 'center', justifyContent: 'center' },
  dialWrap: { width: 190, height: 190, alignItems: 'center', justifyContent: 'center' },
  dialSvg: {},
  dialCenter: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 1 },
  dialTarget: { fontSize: 11, letterSpacing: 0.8, opacity: 0.6 },
  dialValue: { fontSize: 38, fontWeight: '800', letterSpacing: -1.2, fontFamily: Fonts.rounded },
  dialKcal: { fontSize: 12 },
  dialRemain: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, fontFamily: Fonts.rounded, marginTop: -2 },
  dialFoot: { textAlign: 'center', paddingHorizontal: Spacing.three, lineHeight: 18 },
  todayStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: -Spacing.two,
    paddingBottom: 2,
  },
  todayStripText: { fontSize: 12, letterSpacing: 0.2 },
  todayStripDot: { width: 3, height: 3, borderRadius: 3, opacity: 0.55 },
  stripCard: {
    gap: Spacing.three,
    borderRadius: 22,
    borderWidth: 1,
    padding: Spacing.four,
  },
  stripHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  stripTitle: { letterSpacing: 1.2, opacity: 0.75, fontSize: 11 },
  stripLink: { fontSize: 12 },
  arcRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  arcWrap: { flex: 1, alignItems: 'center', gap: 2 },
  arcStage: { width: 88, height: 88, alignItems: 'center', justifyContent: 'center' },
  arcSvg: {},
  arcCenter: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  arcGrams: { fontSize: 16, lineHeight: 18, fontWeight: '700', textAlign: 'center' },
  arcLabel: { marginTop: Spacing.one },
  arcTarget: { fontFamily: Fonts.mono, fontSize: 11, marginTop: -2 },
  splitRow: { flexDirection: 'row', gap: Spacing.three, flexWrap: 'wrap' as const },
  splitCard: { flex: 1, minWidth: 300, gap: Spacing.two, borderRadius: 22, borderWidth: 1, padding: Spacing.three },
  splitHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  waterCard: {},
  tubeRow: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-end' },
  tubeTrack: {
    width: 44,
    height: 96,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  tubeFill: { width: '100%', borderRadius: 12, position: 'absolute', bottom: 0, left: 0, right: 0 },
  tubeTicks: { ...StyleSheet.absoluteFill },
  tick: { position: 'absolute', left: 6, right: 6, height: 1, backgroundColor: 'rgba(255,255,255,0.35)', borderRadius: 1 },
  waterMeta: { flex: 1, gap: 2, justifyContent: 'flex-end' },
  waterBigRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  waterEditHint: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' as const, opacity: 0.7 },
  waterEditRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  waterEditSuffix: { minWidth: 36 },
  waterEditActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: Spacing.two, marginTop: Spacing.one },
  trueBurnRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' as const },
  trueBurnStat: { gap: 2, minWidth: 90 },
  trueBurnNum: { fontSize: 20, fontWeight: '800', fontFamily: Fonts.rounded },
  trueBurnArrow: { fontSize: 18, fontWeight: '700' },
  trueBurnDelta: { borderWidth: 1, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  trueBurnDeltaText: { fontSize: 12, fontWeight: '800' },
  waterBig: { fontSize: 28, fontWeight: '800', letterSpacing: -0.02, fontFamily: Fonts.rounded },
  waterBar: { height: 6, borderRadius: 99, overflow: 'hidden', marginTop: 6 },
  waterBarFill: { height: '100%', borderRadius: 99 },
  waterDock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  waterDockInner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.two - 2,
  },
  waterInputStack: { gap: Spacing.two - 2, marginTop: Spacing.one },
  waterInputRowFull: { flexDirection: 'row', gap: Spacing.two - 2, alignItems: 'center' },
  waterInputField: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    fontSize: 17,
    fontWeight: '700',
    borderWidth: 1.5,
    textAlignVertical: 'center' as const,
    includeFontPadding: false as unknown as boolean,
  },
  waterUnitHint: { marginLeft: Spacing.one, alignSelf: 'center' as const },
  dateRow: { flexDirection: 'row', alignItems: 'center' },
  datePress: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: Spacing.one },
  calendarIconWrap: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  calIconTopSolid: { position: 'absolute', top: 0, left: 0, right: 0, height: 8 },
  calIconTextSolid: { marginTop: 8, fontSize: 12, fontWeight: '800', lineHeight: 12, fontFamily: Fonts.rounded, includeFontPadding: false as unknown as boolean },
  dateText: { fontSize: 14 },
  menuBtn: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  menuLine: { width: 16, height: 2, borderRadius: 99, backgroundColor: '#EEF2F5', opacity: 0.9 },
  menuSheetWrap: { width: '100%', maxWidth: 380, alignSelf: 'center' },
  menuSheet: { borderRadius: 22, borderWidth: 1, padding: Spacing.three, gap: Spacing.two, shadowOpacity: 0.35, shadowRadius: 36, shadowOffset: { width: 0, height: 18 }, elevation: 12, overflow: 'hidden' },
  menuTitle: { fontSize: 11, letterSpacing: 1.2, marginTop: Spacing.one },
  menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 14, paddingVertical: 14, paddingHorizontal: Spacing.three },
  menuItemDanger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 14, paddingVertical: 14, paddingHorizontal: Spacing.three, marginTop: Spacing.one },
  menuChevron: { fontSize: 18, fontWeight: '600' },
  menuNote: { textAlign: 'center', marginTop: Spacing.one, lineHeight: 17 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(2,8,16,0.76)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing.four, paddingVertical: Spacing.four },
  modalWrap: { width: '100%', maxWidth: 380, alignSelf: 'center' },
  pickerCard: { borderRadius: 22, borderWidth: 1, padding: Spacing.three, gap: Spacing.three - 2, shadowOpacity: 0.35, shadowRadius: 36, shadowOffset: { width: 0, height: 18 }, elevation: 12, overflow: 'hidden' },
  pickerHandle: { width: 36, height: 4, borderRadius: 99, alignSelf: 'center', opacity: 0.22, marginBottom: Spacing.one - 2 },
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calNav: { minWidth: 36, minHeight: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  calNavDisabled: { opacity: 0.35 },
  calNavText: { fontSize: 22, fontWeight: '700', lineHeight: 22 },
  calTitle: { fontSize: 13, letterSpacing: 0.4, fontWeight: '700' as const },
  calDivider: { height: StyleSheet.hairlineWidth, opacity: 1 },
  calWeekRow: { flexDirection: 'row' as const, gap: 4 },
  calWeekdayWrap: { flex: 1, height: 22, alignItems: 'center' as const, justifyContent: 'center' as const },
  calWeekday: { textAlign: 'center' as const, fontSize: 11, fontWeight: '700' as const, opacity: 0.55, letterSpacing: 0.3 },
  calGrid: { gap: 4 },
  calWeek: { flexDirection: 'row' as const, gap: 4 },
  calCell: { flex: 1, height: 36, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const },
  calDay: { borderWidth: 1, borderColor: 'transparent' },
  calDayText: { fontSize: 13, fontWeight: '600' },
  calFuture: { opacity: 0.38 },
  calFutureText: { opacity: 0.5 },
  calTodayRing: { borderWidth: 1.5 },
  calFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.one },
  calTodayBtn: { borderWidth: 1, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14, backgroundColor: 'transparent' },
  calTodayBtnActive: { backgroundColor: Brand.lime, borderColor: Brand.lime },
  pickerDone: { alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 10 },
  waterUnitPicker: { flexDirection: 'row', gap: Spacing.one - 2, alignItems: 'center' },
  waterUnitOption: { minHeight: 36, minWidth: 56, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  waterAddButton: { minHeight: 46, minWidth: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, flexShrink: 0 },
  waterAddText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  buttonDimmed: { opacity: 0.45 },
  cardHint: { lineHeight: 17, fontSize: 12 },
  logWell: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  logRowWrap: { width: '100%' },
  logMealLabel: { fontSize: 10, letterSpacing: 1.3, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  logRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, paddingVertical: 12, paddingHorizontal: 14, width: '100%' },
  logRowText: { flex: 1, minWidth: 0, gap: 2 },
  logKcal: { fontSize: 16, fontWeight: '800', fontFamily: Fonts.rounded },
  addMealBtn: { minHeight: 32, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  addMealBtnText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  weightCard: { justifyContent: 'flex-start' },
  weightReadout: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 },
  weightBig: { fontSize: 36, fontWeight: '800', letterSpacing: -0.02, fontFamily: Fonts.rounded },
  weightUnit: { fontSize: 16, fontWeight: '600' },
  horizonTrack: { height: 6, borderRadius: 99, overflow: 'hidden', marginTop: Spacing.two },
  horizonFill: { height: '100%', borderRadius: 99 },
  nextHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.one },
  chipRow: { flexDirection: 'row', gap: Spacing.two },
  chip: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.two + 2,
    alignItems: 'center',
  },
  chipIcon: { fontSize: 18 },
  chipTitle: { textAlign: 'center', fontSize: 11 },
  chipDesc: { textAlign: 'center', fontSize: 11, lineHeight: 14 },
  badge: { borderWidth: 1, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8 },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  burnBarTrack: { height: 6, borderRadius: 99, overflow: 'hidden', marginTop: 8, position: 'relative' },
  burnBarEst: { position: 'absolute', top: 0, bottom: 0, borderRadius: 99, opacity: 0.22 },
  burnBarDrift: { position: 'absolute', top: 0, bottom: 0, borderRadius: 99 },
  sparkWrap: { alignItems: 'center', gap: 4, marginTop: 6 },
  sparkLabels: { flexDirection: 'row', justifyContent: 'space-between', width: 160 },
  plateauWrap: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginTop: 8 },
  plateauDot: { color: '#ef4444', fontSize: 9, lineHeight: 17, marginTop: 1 },
  adoptRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 },
  adoptGhost: { borderWidth: 1, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  adoptGhostText: { fontSize: 12, fontWeight: '800' },
  adoptPrimary: { borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14, minHeight: 36, alignItems: 'center', justifyContent: 'center', flex: 1 },
  adoptPrimaryText: { fontSize: 12, fontWeight: '800' },
  footer: { alignItems: 'center', gap: Spacing.three, marginTop: Spacing.two },
  footerLink: { paddingVertical: Spacing.one },
  pressed: { opacity: 0.65 },
  deactivateText: { color: Brand.danger },
  footerNote: { textAlign: 'center', marginTop: Spacing.two, paddingHorizontal: Spacing.three },
});
