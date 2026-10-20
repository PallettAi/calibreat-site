import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
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
import { HeaderGlyphButton, HeaderMenuButton, StreakFireMark, WaterDropMark } from '@/components/header-glyphs';
import { AppTour } from '@/components/app-tour';
import { MealLogSheet } from '@/components/meal-log-sheet';
import { StreakSheet, WeekPips, type ShareSelection } from '@/components/streak-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WaterSheet } from '@/components/water-sheet';
import { Brand } from '@/constants/app';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useKeyboardReveal } from '@/hooks/use-keyboard-reveal';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import {
  addLogEntry,
  addWaterForDay,
  addWeighIn,
  deleteLogEntry,
  getFirstWeighIn,
  getGoals,
  getIntakeHistory,
  getLogsForDay,
  getProfile,
  getRecents,
  getUnitPrefs,
  getWaterForDay,
  getWeighIns,
  getWorkoutKcalForDay,
  saveProfile,
  saveUnitPrefs,
  setWaterForDay,
  updateLogEntry,
  type Goals,
  type LogEntry,
  type LogInput,
  type Profile,
  type RecentMeal,
} from '@/lib/db';
import { formatMacroSummary, groupLogsByMeal, logDisplayName, MEAL_SLOTS, sumDayMacros } from '@/lib/diary';
import { buildShareCard, shareDateLabel } from '@/lib/share-card';
import { buildDailyCard, recapDayKey, type DailyCard } from '@/lib/share-daily';
import { loadRecapOfferedDayKey, saveRecapOfferedDayKey } from '@/lib/daily-recap-store';
import { loadTourSeen, saveTourSeen } from '@/lib/tour-store';
import { shareCardImage } from '@/lib/share-card-capture';
import { DEFAULT_SHARE_FORMAT, DEFAULT_SHARE_TEMPLATE, type ShareFormatId } from '@/lib/share-templates';
import { ShareCardPreview, ShareCardStage, type ShareCardProps } from '@/components/share-card';
import { DailyShareCardStage } from '@/components/daily-share-card';
import { DailyRecapSheet } from '@/components/daily-recap-sheet';
import { hapticLight, hapticSelect } from '@/lib/haptics';
import { adaptiveHistory, adaptiveTdee, detectPlateau, recheckTargets } from '@/lib/nutrition';
import { activityCopy, computeDayBudget, weekCopy } from '@/lib/day-budget';
import { readDayActivity, type DayActivity } from '@/lib/health-connect';
import { buildWidgetSnapshot } from '@/lib/widget-snapshot';
import { saveWidgetSnapshot } from '@/lib/widget-snapshot-store';
import { burnTrend, loggingCoverage } from '@/lib/trends';
import { getCalorieOverride, getTrueBurnState, saveTrueBurnState, setCalorieOverride, shouldShowAdoptPrompt, type TrueBurnState } from '@/lib/trueburn';
import { claimStreak, emptyStreak, expireStreak, STREAK_CLAIM_MS, streakNeedsClaim, weekPips, type StreakState } from '@/lib/streak';
import { loadStreak, saveStreak } from '@/lib/streak-store';
import { emptyFastState, fastElapsedMs, fastProgress, formatElapsed, isFasting, nextFastMilestone, startFast, stopFast, type FastState } from '@/lib/fasting';
import { loadFastState, saveFastState } from '@/lib/fasting-store';
import { CUP_ML, formatWeightKg, normalizeDecimalNumber, parseWeightInput, waterGoalMl, waterToMl, type WaterUnit, type WeightUnit } from '@/lib/units';

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
  const keyboard = useKeyboardReveal();
  const router = useRouter();
  const scheme = useColorScheme();
  const params = useLocalSearchParams<{ first?: string; sheet?: string; tour?: string }>();
  const { t } = useT();
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
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg');
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(() => startOfMonth(new Date()));
  // Train's header buttons route here with ?sheet=water|streak|menu. Each push mounts a
  // fresh Home, so the sheet opens from the initial state rather than an effect.
  const [showMenu, setShowMenu] = useState(() => params?.sheet === 'menu');
  const [showWater, setShowWater] = useState(() => params?.sheet === 'water');
  const [showStreak, setShowStreak] = useState(() => params?.sheet === 'streak');
  // The startup tour: due once after first-run setup unless already seen; replayed
  // from Settings with ?tour=1.
  const [tourDue, setTourDue] = useState(false);
  const [tourReplay, setTourReplay] = useState(() => params?.tour === '1');
  const [streak, setStreak] = useState<StreakState>(emptyStreak);
  const [editWaterValue, setEditWaterValue] = useState('');
  const [savingWaterEdit, setSavingWaterEdit] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [recents, setRecents] = useState<RecentMeal[]>([]);
  const [showLogSheet, setShowLogSheet] = useState(() => params?.first === '1');
  const [editingLog, setEditingLog] = useState<LogEntry | null>(null);
  const [firstScanOpen] = useState(() => params?.first === '1');
  const [weighInInput, setWeighInInput] = useState('');
  const [addingWeighIn, setAddingWeighIn] = useState(false);
  const [recalibratingGoals, setRecalibratingGoals] = useState(false);
  const [weighIns, setWeighIns] = useState<{ kg: number; measuredAt: string }[]>([]);
  // The very first weigh-in ever, which the 60-row window cannot report once a
  // user passes 60 entries. "Since the first" has to mean the first.
  const [firstWeighInKg, setFirstWeighInKg] = useState<number | null>(null);
  const [intakeHistory, setIntakeHistory] = useState<{ dayKey: string; kcal: number }[]>([]);
  const [workoutKcal, setWorkoutKcal] = useState(0);
  const [hcDay, setHcDay] = useState<DayActivity | null>(null);
  const [trueBurnPersist, setTrueBurnPersist] = useState<TrueBurnState>({});
  const [overrideKcal, setOverrideKcal] = useState<number | null>(null);
  const [trueBurnActionBusy, setTrueBurnActionBusy] = useState(false);
  const [fast, setFast] = useState<FastState>(emptyFastState);
  const [now, setNow] = useState(() => Date.now());
  const [cardShare, setCardShare] = useState<'idle' | 'working' | 'error'>('idle');
  const [cardShareSelection, setCardShareSelection] = useState<ShareSelection>({
    format: DEFAULT_SHARE_FORMAT,
    template: DEFAULT_SHARE_TEMPLATE,
  });
  const cardShareRef = useRef<View | null>(null);
  const [dailyRecap, setDailyRecap] = useState<{ dayKey: string; card: DailyCard } | null>(null);
  const [showRecap, setShowRecap] = useState(false);
  const [recapShare, setRecapShare] = useState<'idle' | 'working' | 'error'>('idle');
  const dailyCardRef = useRef<View | null>(null);
  const [dailyFormat, setDailyFormat] = useState<ShareFormatId>('portrait');

  const waterPulse = useRef(new Animated.Value(0)).current;

  const selectedKey = formatISO(selectedDate);

  // First-session onboarding: setup finishes with ?first=1 and this screen
  // answers by opening the meal sheet straight onto the barcode viewfinder.
  // Clear the URL param once consumed so a reload does not re-open it.
  useEffect(() => {
    if (params?.first === '1') {
      router.setParams({ first: undefined });
    }
  }, [params?.first, router]);

  // Clear the Train sheet param once consumed so returning to Home does not re-open it.
  useEffect(() => {
    if (params?.sheet) {
      router.setParams({ sheet: undefined });
    }
  }, [params?.sheet, router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, g, prefs, tb, ov, st, fs] = await Promise.all([
          getProfile(),
          getGoals(),
          getUnitPrefs(),
          getTrueBurnState(),
          getCalorieOverride(),
          loadStreak(),
          loadFastState(),
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
        setWeightUnit(prefs.weight);
        setTrueBurnPersist(tb);
        setOverrideKcal(ov);
        setStreak(nextStreak);
        setFast(fs);
        setLoadError(null);
      } catch {
        if (!cancelled) setLoadError(t('home.couldNotOpenLogTry'));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootTick]);

  // First-run tour: due once, until the user finishes or skips it.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const seen = await loadTourSeen();
      if (!cancelled && !seen) setTourDue(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([
        getWaterForDay(selectedKey),
        getLogsForDay(selectedKey),
        getRecents(8),
        getWeighIns(60),
        getFirstWeighIn(),
        getIntakeHistory(60),
        getWorkoutKcalForDay(selectedKey),
        readDayActivity(selectedKey),
      ]).then(([w, dayLogs, recentMeals, wi, first, ih, burn, hc]) => {
        if (cancelled) return;
        setWaterMl(w);
        setLogs(dayLogs);
        setRecents(recentMeals);
        setWeighIns(wi.map((x) => ({ kg: x.kg, measuredAt: x.measuredAt })));
        setFirstWeighInKg(first?.kg ?? null);
        setIntakeHistory(ih);
        setWorkoutKcal(burn);
        setHcDay(hc);
      });
      return () => {
        cancelled = true;
      };
    }, [selectedKey]),
  );

  // ── The daily recap moment ──────────────────────────────────────────
  // Once per day, after load settles, offer yesterday's card: the day is
  // closed, the numbers are final, and one clean prompt is the whole feature.
  // The offered flag is recorded whether the user shares or taps "Not now" —
  // a dismissed day never returns as a nag.
  useEffect(() => {
    if (!loaded || profile === null || !goals || dailyRecap) return;
    let cancelled = false;
    (async () => {
      try {
        const [history, offered] = await Promise.all([getIntakeHistory(10), loadRecapOfferedDayKey()]);
        if (cancelled) return;
        const todayKey = formatISO(new Date());
        const dayKey = recapDayKey(new Date(), todayKey, history.some((d) => d.kcal > 0));
        if (!dayKey || offered === dayKey) return;
        const [dayLogs, trainKcal, wi] = await Promise.all([getLogsForDay(dayKey), getWorkoutKcalForDay(dayKey), getWeighIns(60)]);
        if (cancelled) return;
        const measured = (() => {
          if (!profile || !goals || wi.length < 2) return null;
          const a = adaptiveTdee({
            estimatedTdee: goals.tdee,
            weighIns: wi.map((w) => ({ kg: w.kg, at: w.measuredAt })),
            intakeByDay: history,
            goal: profile.goal,
            ratePerWeek: profile.ratePerWeek,
          });
          return a.ready ? a.measuredTdee ?? null : null;
        })();
        const target = overrideKcal ?? goals.calorieTarget ?? 0;
        const decision = buildDailyCard({
          targetKcal: target,
          foodKcal: sumDayMacros(dayLogs).kcal,
          workoutKcal: trainKcal,
          measuredBurnKcal: measured,
          usedMeasuredTarget: overrideKcal != null,
        });
        if (!decision.eligible) return;
        await saveRecapOfferedDayKey(dayKey);
        if (cancelled) return;
        setDailyRecap({ dayKey, card: decision.card });
        setShowRecap(true);
      } catch {
        // The recap is a delight, not a duty — any failure just skips it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loaded, profile, goals, dailyRecap, overrideKcal]);

  // Keep the streak flame honest — but when fasting, show a live clock.
  // 1s while fasting so 14h 05m feels alive; 60s otherwise to spare renders.
  useEffect(() => {
    const active = isFasting(fast, Date.now());
    const ms = active ? 1000 : 60_000;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [fast]);

  // Derive live streak state at render time so an expired window shows 0
  // immediately without triggering a cascading setState inside an effect.
  const activeStreak = expireStreak(streak, now);
  useEffect(() => {
    if (activeStreak.current === streak.current) return;
    void saveStreak(activeStreak);
  }, [activeStreak, streak]);

  // Wake exactly when the flame state flips: the claim window opening, or a
  // missed window zeroing the run. Re-armed every time the streak or the tick
  // changes; cleared on unmount and after a claim.
  useEffect(() => {
    const last = activeStreak.lastClaimedAt ? Date.parse(activeStreak.lastClaimedAt) : null;
    if (last == null || !Number.isFinite(last)) return;
    const flipAt = streakNeedsClaim(activeStreak, now) ? last + STREAK_CLAIM_MS : last + STREAK_CLAIM_MS * 2;
    const wait = flipAt - now;
    if (wait <= 0) return;
    const id = setTimeout(() => setNow(Date.now()), wait);
    return () => clearTimeout(id);
  }, [now, activeStreak]);

  // ── All hooks are above; only conditional rendering below. ──
  // Widget snapshot for today. Above the early returns so hook order never changes.
  // The fasting clock only refreshes when another input changes, which is acceptable
  // for v1 (spec §4.1: a stale snapshot until the next open is fine).
  useEffect(() => {
    if (!loaded || profile === null || !goals) return;
    const today = formatISO(new Date());
    const onToday = selectedKey === today;
    const foodByDay: Record<string, number> = Object.fromEntries(intakeHistory.map((d) => [d.dayKey, d.kcal]));
    const base = overrideKcal ?? goals.calorieTarget ?? 2000;
    const budget = computeDayBudget({
      todayKey: today,
      baseTarget: base,
      goals: { tdee: goals.tdee, bmr: goals.bmr },
      foodByDay,
      activity: {
        connected: onToday && hcDay != null,
        hcActiveKcal: onToday ? (hcDay?.activeKcal ?? 0) : 0,
        hcExerciseCount: onToday ? (hcDay?.exerciseCount ?? 0) : 0,
        trainMetKcal: onToday ? workoutKcal : 0,
      },
    });
    if (!budget) return;
    const latestKg = weighIns.length ? weighIns[weighIns.length - 1]!.kg : profile.weightKg;
    const nowMs = Date.now();
    const fastSec = isFasting(fast, nowMs) ? Math.floor(fastElapsedMs(fast, nowMs) / 1000) : null;
    void saveWidgetSnapshot(
      buildWidgetSnapshot({
        remaining: budget.remaining,
        proteinG: onToday ? sumDayMacros(logs).proteinG : 0,
        proteinGoalG: goals.proteinG,
        waterMl: onToday ? waterMl : 0,
        waterGoalMl: waterGoalMl(latestKg),
        fastElapsedSec: fastSec,
        sourceLabel: budget.sourceLabel,
        now: new Date(nowMs),
      }),
    ).catch(() => {});
  }, [loaded, profile, goals, intakeHistory, logs, waterMl, fast, hcDay, workoutKcal, overrideKcal, selectedKey, weighIns]);

  if (!loaded) return <ThemedView style={styles.container} />;
  if (loadError) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
          <View style={[styles.scrollContent, { justifyContent: 'center' }]}>
            <ThemedText type="title">{t('home.couldNotOpenLog')}</ThemedText>
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
              <Text style={styles.waterAddText}>{t('common.tryAgain')}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }
  if (profile === null) return <Redirect href="/setup" />;

  const latestKg = weighIns.length ? weighIns[weighIns.length - 1]!.kg : profile.weightKg;
  const waterGoal = waterGoalMl(latestKg);

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

  const targetRecheck = (() => {
    if (!profile || !goals) return null;
    return recheckTargets({
      profile,
      stored: { ...goals, dailyAdjustment: goals.calorieTarget - goals.tdee },
      weighIns: weighIns.map((w) => ({ kg: w.kg, at: w.measuredAt })),
    });
  })();

  const dayMacros = sumDayMacros(logs);
  const intakeKcal = dayMacros.kcal;
  // Adopted measured target overrides dial until profile is re-saved in setup.
  // Keep leaves the formula target on the dial — never auto-drive from True Burn.
  const dialTarget = overrideKcal ?? goals?.calorieTarget ?? 2000;
  // The one remaining-calorie number: week bank + surplus eat-back (day-budget.ts).
  const foodByDay: Record<string, number> = Object.fromEntries(intakeHistory.map((d) => [d.dayKey, d.kcal]));
  foodByDay[selectedKey] = intakeKcal;
  const dayBudget = computeDayBudget({
    todayKey: selectedKey,
    baseTarget: dialTarget,
    goals: goals ? { tdee: goals.tdee, bmr: goals.bmr } : null,
    foodByDay,
    activity: {
      connected: hcDay != null,
      hcActiveKcal: hcDay?.activeKcal ?? 0,
      hcExerciseCount: hcDay?.exerciseCount ?? 0,
      trainMetKcal: workoutKcal,
    },
  });
  const budget = dayBudget?.todayTarget ?? dialTarget;
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

  function openEditLog(entry: LogEntry) {
    setEditingLog(entry);
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
    const kg = parseWeightInput(weighInInput, weightUnit);
    if (kg == null || !Number.isFinite(kg) || kg < 20 || kg > 400) return;
    hapticLight();
    setAddingWeighIn(true);
    try {
      // Stamp today's weigh-in at the current moment, and past days at local
      // noon so a retroactive weigh-in never sorts before a morning weigh-in
      // recorded on the same day.
      const stamp = isToday(selectedDate)
        ? new Date()
        : new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 12, 0, 0, 0);
      await addWeighIn(kg, stamp);
      const [wi, first] = await Promise.all([getWeighIns(60), getFirstWeighIn()]);
      setWeighIns(wi.map((x) => ({ kg: x.kg, measuredAt: x.measuredAt })));
      // Going from zero weigh-ins to one is the only add that changes which
      // row is the first, so this has to move with the window.
      setFirstWeighInKg(first?.kg ?? null);
      setWeighInInput('');
    } finally {
      setAddingWeighIn(false);
    }
  }

  async function handleRecalibrateTargets() {
    if (!profile || !targetRecheck?.stale || recalibratingGoals) return;
    hapticSelect();
    setRecalibratingGoals(true);
    try {
      const updatedProfile: Profile = {
        ...profile,
        weightKg: targetRecheck.weightBasisKg,
      };
      const nextGoals = await saveProfile(updatedProfile);
      setProfile(updatedProfile);
      setGoals(nextGoals);
    } finally {
      setRecalibratingGoals(false);
    }
  }

  async function handleQuickAddWater(ml: number) {
    if (addingWater || !Number.isFinite(ml) || ml <= 0) return;
    hapticLight();
    setAddingWater(true);
    try {
      await addWaterForDay(selectedKey, ml);
      setWaterMl((current) => {
        const next = current + ml;
        setEditWaterValue(waterUnit === 'cups' ? String(Math.round((next / CUP_ML) * 10) / 10) : String(next));
        return next;
      });
      waterPulse.setValue(1);
      Animated.timing(waterPulse, { toValue: 0, duration: 420, useNativeDriver: true }).start();
    } finally {
      setAddingWater(false);
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
    const next = claimStreak(activeStreak, Date.now());
    setStreak(next);
    void saveStreak(next);
  }

  /**
   * Share from the streak sheet — the highest-frequency behavior moment in
   * the app (the daily claim). The hidden card stage below is always
   * mounted, so the capture is instant; iOS needs the share sheet to open
   * inside the same JS task as the user's tap, so the capture awaits inside
   * this handler rather than setting state and rendering afterwards.
   */
  async function handleStreakCardShare(selection: ShareSelection) {
    if (cardShare === 'working' || !cardShareRef.current) return;
    // Capture the card the user just previewed, not whatever is on screen next.
    // The picker lives in the streak sheet but the capture stage lives here, so
    // when the user changes style and immediately taps Share, the stage is still
    // laid out as the *old* shape in this tick: the state update above has not
    // been committed yet, and captureRef draws the view as it is now. Wait out
    // the re-render (two frames, so the new layout has actually been applied)
    // before handing anything to the OS.
    const changed = selection.format !== cardShareSelection.format || selection.template !== cardShareSelection.template;
    setCardShareSelection(selection);
    if (changed) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    }
    setCardShare('working');
    const result = await shareCardImage(cardShareRef, selection);
    setCardShare(result.ok ? 'idle' : 'error');
  }

  /**
   * Share from the daily recap sheet — same capture path as the weekly card.
   * The sheet hands over the format the user previewed; the hidden stage
   * re-renders to that format, two frames wait out the layout, then capture.
   */
  async function handleRecapShare(format: ShareFormatId) {
    if (recapShare === 'working' || !dailyCardRef.current) return;
    const changed = format !== dailyFormat;
    setDailyFormat(format);
    if (changed) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    }
    setRecapShare('working');
    const result = await shareCardImage(dailyCardRef, { format, template: 'instrument' });
    setRecapShare(result.ok ? 'idle' : 'error');
  }

  async function handleStartFast() {
    hapticSelect();
    const at = Date.now();
    const next = startFast(fast, at);
    if (next === fast) return;
    setFast(next);
    setNow(at);
    await saveFastState(next);
  }

  async function handleStopFast() {
    hapticLight();
    const at = Date.now();
    const next = stopFast(fast, at);
    if (next === fast) return;
    setFast(next);
    setNow(at);
    await saveFastState(next);
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

  const accentText = isDark ? Brand.lime : Brand.primaryDeep;
  const accentSoft = isDark ? 'rgba(183,233,60,0.08)' : 'rgba(31,157,85,0.08)';
  const hairline = theme.line;
  const mutedTrack = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(13,21,30,0.08)';
  const cardBg = isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF';

  const caloriesPct = budget ? Math.min(1, intakeKcal / budget) : 0;
  const waterPct = Math.min(1, waterMl / waterGoal);

  // Weight card: the trend is the only honest number we can show — there is no
  // goal weight in the data model, so anything resembling a progress bar would
  // be decoration pretending to be information.
  const latestWeighIn: { kg: number; measuredAt: string } | null = weighIns.length ? weighIns[weighIns.length - 1]! : null;
  // weighIns[0] is the oldest row in the 60-entry window, NOT the first ever
  // recorded — so "since the first" has to read the separately-fetched first,
  // or it quietly becomes "since your 60th weigh-in" once someone passes 60.
  // For the same reason the count is a floor, not a total, while the window is
  // full: a user with 200 weigh-ins was being told they had 60.
  const firstWeighIn = firstWeighInKg === null ? null : { kg: firstWeighInKg };
  const weighInCount = weighIns.length >= 60 ? `${weighIns.length}+` : String(weighIns.length);
  const weightDeltaKg =
    weighIns.length > 1 && firstWeighIn && latestWeighIn ? latestWeighIn.kg - firstWeighIn.kg : null;
  const weightMeta = !weighIns.length
    ? t('home.startWeightSetup')
    : weightDeltaKg === null
      ? `${weighInCount} weigh-in — log again to see a trend.`
      : Math.abs(weightDeltaKg) < 0.1
        ? `${weighInCount} weigh-ins · steady since the first.`
        : `${weighInCount} weigh-ins · ${weightDeltaKg > 0 ? '+' : '−'}${Math.abs(weightDeltaKg).toFixed(1)} kg since the first.`;
  const latestWeighInLabel = latestWeighIn
    ? isToday(new Date(latestWeighIn.measuredAt))
      ? 'today'
      : `on ${formatShortDate(new Date(latestWeighIn.measuredAt))}`
    : '';

  // calendar math — build explicit week rows so columns stay aligned
  const todayKey = formatISO(new Date());
  const fireLive = streakNeedsClaim(activeStreak, now);
  const fastActive = isFasting(fast, now);
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

  // ── Weekly share card (content only — capture stage renders below) ──
  const coverage = loggingCoverage(intakeHistory);
  const burn = burnTrend(burnHistory);
  const streakShareCard = buildShareCard({ streak: activeStreak, coverage, burn });

  /**
   * Every field the card needs, assembled once.
   *
   * The off-screen stage and the sheet's preview must render from *identical*
   * props or the image the user previews is not the image they post, and the
   * achievement templates read more of the card (medal, stamp, run to beat,
   * goal track, macro rings) than the editorial layouts did. One payload, two
   * call sites.
   */
  const weeklyCardProps: Omit<ShareCardProps, 'format' | 'template'> | null = streakShareCard.eligible
    ? {
        copy: streakShareCard.copy,
        hero: streakShareCard.hero,
        rows: streakShareCard.rows,
        eyebrow: streakShareCard.eyebrow,
        achievement: streakShareCard.achievement,
        status: streakShareCard.status,
        best: streakShareCard.best,
        progress: streakShareCard.progress,
        dateLabel: shareDateLabel(selectedDate),
        litDays: weekPips(activeStreak.current),
        // The Grid layout slices `loggedDays` 7 per row, but intakeHistory is a
        // dense 60-day array, so this rendered a 9-row calendar and a "12/60
        // LOGGED" header beside sibling layouts that assume a 7-day week.
        // getIntakeHistory is oldest-first, so the trailing week is the last 7.
        loggedDays: intakeHistory.slice(-7).map((point) => point.kcal > 0),
        burnPoints: burnHistory.map((p) => p.measuredTdee),
        burnEst: adaptive?.estimatedTdee,
        // Today's macros against their targets, for the Goal card's rings.
        macros: goals
          ? [
              { label: 'protein', value: Math.round(dayMacros.proteinG), target: Math.round(goals.proteinG) },
              { label: 'carbs', value: Math.round(dayMacros.carbsG), target: Math.round(goals.carbsG) },
              { label: 'fat', value: Math.round(dayMacros.fatG), target: Math.round(goals.fatG) },
            ]
          : undefined,
      }
    : null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        {/*
         * Off-screen capture stage for the streak-sheet share card. Always
         * mounted once data exists so the share is instant; transparent and
         * hidden from accessibility.
         */}
        {weeklyCardProps ? (
          <ShareCardStage
            cardRef={cardShareRef}
            format={cardShareSelection.format}
            template={cardShareSelection.template}
            {...weeklyCardProps}
          />
        ) : null}
        {dailyRecap ? <DailyShareCardStage cardRef={dailyCardRef} card={dailyRecap.card} format={dailyFormat} /> : null}
        <ScrollView
          {...keyboard.scrollProps}
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Header: wordmark + calibration badge ────────────── */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <BrandMark size={28} />
            </View>
            <View style={styles.headerRight}>
              <HeaderGlyphButton label={t('home.dailyStreak')} onPress={handleFirePress} borderColor={hairline} backgroundColor={cardBg}>
                <StreakFireMark live={fireLive} count={activeStreak.current} color={fireLive ? '#EA580C' : '#9A3412'} />
              </HeaderGlyphButton>
              <HeaderGlyphButton label={t('home.addWater')} onPress={openWater} borderColor={hairline} backgroundColor={cardBg}>
                <WaterDropMark fill={waterPct} color={isDark ? '#38BDF8' : '#0284C7'} />
              </HeaderGlyphButton>
              <HeaderMenuButton onPress={() => setShowMenu(true)} borderColor={hairline} backgroundColor={cardBg} lineColor={theme.text} />
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
              onPress={() => {
                setShowPicker((v) => {
                  const next = !v;
                  if (next) setPickerMonth(startOfMonth(selectedDate));
                  return next;
                });
              }}
              accessibilityRole="button"
              accessibilityLabel={t('home.chooseDate')}
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
              {(() => {
                const goalLitres = Math.round(waterGoal / 100) / 10;
                const currentLitres = Math.round(waterMl / 100) / 10;
                return waterUnit === 'cups'
                  ? `${Math.round((waterMl / 240) * 10) / 10} / ${Math.round((waterGoal / 240) * 10) / 10} cups`
                  : `${currentLitres} / ${goalLitres} L`;
              })()}
            </ThemedText>
            <View style={[styles.todayStripDot, { backgroundColor: theme.muted }]} />
            <WeekPips
              lit={weekPips(activeStreak.current)}
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
                      accessibilityRole="button"
                      accessibilityLabel={t('home.previousMonth')}
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
                          accessibilityRole="button"
                          accessibilityLabel={t('home.nextMonth')}
                          accessibilityState={{ disabled: !canGoNext }}
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
                              accessibilityRole="button"
                              accessibilityLabel={d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                              accessibilityState={{ selected: active, disabled: isFuture }}
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
                      accessibilityRole="button"
                      accessibilityLabel={t('home.jumpToToday')}
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
                    <Pressable onPress={() => setShowPicker(false)} accessibilityRole="button" accessibilityLabel={t('home.closeDatePicker')} style={({ pressed }) => [styles.pickerDone, pressed && styles.pressed]}>
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
                accessibilityLabel={t('home.logMeal')}
                style={({ pressed }) => [styles.dialAdd, { borderColor: accentText, backgroundColor: accentSoft }, pressed && styles.pressed]}
              >
                <View style={[styles.plusMark, { pointerEvents: 'none' }]}>
                  <View style={[styles.plusBarH, { backgroundColor: accentText }]} />
                  <View style={[styles.plusBarV, { backgroundColor: accentText }]} />
                </View>
              </Pressable>
            </View>
            <Pressable onPress={openNewLog} style={({ pressed }) => [pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={t('home.logMeal')}>
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
              const remain = dayBudget?.remaining ?? 0;
              return (
                <>
                  <Text style={[styles.dialRemain, { color: remain < 0 ? Brand.danger : accentText }]}>
                    {remain >= 0 ? t('home.kcalLeft', { kcal: remain.toLocaleString() }) : t('home.kcalOver', { kcal: Math.abs(remain).toLocaleString() })}
                  </Text>
                  {dayBudget ? (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.dialFoot}>
                      {dayBudget.burnSource === 'none'
                        ? t('home.exerciseNone')
                        : t('home.exerciseBurned', { kcal: dayBudget.measuredActiveKcal.toLocaleString(), source: dayBudget.sourceLabel })}
                    </ThemedText>
                  ) : null}
                  {dayBudget && dayBudget.burnSource !== 'none' ? (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.dialFoot}>
                      {activityCopy(dayBudget)}
                    </ThemedText>
                  ) : null}
                  {dayBudget ? (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.dialFoot}>
                      {weekCopy(dayBudget)}
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
                {intakeKcal === 0 ? t('home.nothingLoggedYet') : t('home.kcalToday', { kcal: intakeKcal.toLocaleString(), reason: adaptive?.reason ?? t('home.logWeighInsForTrueBurn') })}
              </ThemedText>
            )}
          </View>

          {/* ── FASTING TIMER ─────────────────────────────────── */}
          <View style={[styles.stripCard, { backgroundColor: cardBg, borderColor: hairline }]}>
            <View style={styles.stripHead}>
              <ThemedText type="smallBold" style={styles.stripTitle}>{t('home.fasting')}</ThemedText>
              {!fastActive && fast.lastDurationMs != null ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Last fast {formatElapsed(fast.lastDurationMs)}
                </ThemedText>
              ) : null}
            </View>
            {fastActive ? (
              <>
                <View style={styles.fastReadout}>
                  <Text style={[styles.fastClock, { color: accentText }]}>{formatElapsed(fastElapsedMs(fast, now))}</Text>
                  <ThemedText type="small" themeColor="textSecondary">
                    elapsed
                  </ThemedText>
                </View>
                {(() => {
                  const elapsed = fastElapsedMs(fast, now);
                  const milestone = nextFastMilestone(elapsed);
                  const prog = fastProgress(elapsed);
                  return (
                    <View style={styles.fastProgressBlock}>
                      <View style={[styles.burnBarTrack, { backgroundColor: mutedTrack, marginTop: 2 }]}>
                        <View
                          style={[
                            styles.waterBarFill,
                            { width: `${Math.max(3, Math.round(prog.pct * 100))}%`, backgroundColor: accentText },
                          ]}
                        />
                      </View>
                      {milestone ? (
                        <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                          {milestone.hours}h milestone in {milestone.inLabel}
                        </ThemedText>
                      ) : (
                        <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                          48h+ fast milestone reached
                        </ThemedText>
                      )}
                    </View>
                  );
                })()}
                <CrispPress onPress={() => void handleStopFast()} innerStyle={[styles.fastStop, { borderColor: hairline }]}>
                  <Text style={[styles.fastStopText, { color: Brand.danger }]}>{t('home.endFast')}</Text>
                </CrispPress>
                <ThemedText type="small" themeColor="textSecondary" style={styles.cardHint}>
                  The clock runs from when you started — closing the app doesn&apos;t pause it.
                </ThemedText>
              </>
            ) : (
              <>
                <CrispPress onPress={() => void handleStartFast()} innerStyle={[styles.fastStart, { backgroundColor: accentText }]}>
                  <Text style={[styles.fastStartText, { color: isDark ? '#0A1019' : '#fff' }]}>{t('home.startFast')}</Text>
                </CrispPress>
                <ThemedText type="small" themeColor="textSecondary" style={styles.cardHint}>
                  {fast.lastDurationMs != null
                    ? t('home.lastRun', { duration: formatElapsed(fast.lastDurationMs) })
                    : t('home.tapStartHint')}
                </ThemedText>
              </>
            )}
          </View>

          {logs.length > 0 ? (
            <View style={[styles.stripCard, { backgroundColor: cardBg, borderColor: hairline }]}>
              <View style={styles.stripHead}>
                <ThemedText type="smallBold" style={styles.stripTitle}>
                  {t('home.todaysLog')}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('home.tapToEdit')}
                </ThemedText>
              </View>
              {MEAL_SLOTS.map((slot) => {
                const entries = groupLogsByMeal(logs)[slot.value];
                if (!entries.length) return null;
                const slotMacros = sumDayMacros(entries);
                const slotMacroHint = formatMacroSummary({
                  proteinG: slotMacros.proteinG || null,
                  carbsG: slotMacros.carbsG || null,
                  fatG: slotMacros.fatG || null,
                });
                return (
                  <View key={slot.value} style={styles.logMealBlock}>
                    <View style={styles.logMealHeader}>
                      <ThemedText type="small" themeColor="textSecondary" style={styles.logMealLabel}>
                        {slot.label}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {slotMacros.kcal.toLocaleString()} kcal{slotMacroHint ? ` · ${slotMacroHint}` : ''}
                      </ThemedText>
                    </View>
                    {entries.map((entry) => {
                      const entryMacros = formatMacroSummary(entry);
                      return (
                        <Pressable
                          key={entry.id}
                          onPress={() => openEditLog(entry)}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${logDisplayName(entry)}`}
                          style={({ pressed }) => [styles.logRow, { borderColor: hairline }, pressed && styles.pressed]}
                        >
                          <View style={styles.logInfo}>
                            <ThemedText type="smallBold" style={styles.logName} numberOfLines={1}>
                              {logDisplayName(entry)}
                            </ThemedText>
                            {entryMacros ? (
                              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                                {entryMacros}
                              </ThemedText>
                            ) : null}
                          </View>
                          <Text style={[styles.logKcal, { color: accentText }]}>{entry.kcal}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          ) : null}

          {/* ── True Burn Calibration card (Phase A) ────────────── */}
          <View style={[styles.stripCard, { backgroundColor: cardBg, borderColor: hairline }]}>
            <View style={styles.stripHead}>
              <ThemedText type="smallBold" style={styles.stripTitle}>{t('home.trueBurn')}</ThemedText>
              {adaptive?.ready ? (
                <View style={[styles.badge, { backgroundColor: accentSoft, borderColor: accentText }]}>
                  <Text style={[styles.badgeText, { color: accentText }]}>
                    {(adaptive.confidence ?? 'low').toUpperCase()} · {adaptive.windowDays}d · {adaptive.weighInsUsed} weigh-ins
                  </Text>
                </View>
              ) : (
                <ThemedText type="small" themeColor="textSecondary">{t('common.needsData')}</ThemedText>
              )}
            </View>
            {adaptive?.ready ? (
              <>
                <View style={styles.trueBurnRow}>
                  <View style={styles.trueBurnStat}>
                    <ThemedText type="small" themeColor="textSecondary">{t('home.formula')}</ThemedText>
                    <Text style={[styles.trueBurnNum, { color: theme.text }]}>{adaptive.estimatedTdee.toLocaleString()}</Text>
                  </View>
                  <Text style={[styles.trueBurnArrow, { color: accentText }]}>→</Text>
                  <View style={styles.trueBurnStat}>
                    <ThemedText type="small" themeColor="textSecondary">{t('home.measuredBurn')}</ThemedText>
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
                    ? t('home.strongSignal', { days: adaptive.windowDays })
                    : adaptive.confidence === 'medium'
                      ? `Moderate signal — ${adaptive.loggedDays ?? adaptive.windowDays} of ${adaptive.windowDays} days logged, trend still settling.`
                      : `Early signal — keep logging and weighing in to tighten the estimate (${Math.round((adaptive.blend ?? 0) * 100)}% blended toward your formula).`}
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
                      <Text style={[styles.adoptGhostText, { color: theme.muted }]}>{t('home.keepKcal', { kcal: goals?.calorieTarget.toLocaleString() ?? '' })}</Text>
                    </CrispPress>
                    <CrispPress onPress={handleAdoptBurn} disabled={trueBurnActionBusy} innerStyle={[styles.adoptPrimary, { backgroundColor: accentText }]}>
                      <Text style={[styles.adoptPrimaryText, { color: isDark ? '#0A1019' : '#fff' }]}>{t('home.adoptKcal', { kcal: adaptive.suggestedTarget?.toLocaleString() ?? '' })}</Text>
                    </CrispPress>
                  </View>
                ) : overrideKcal != null ? (
                  <View style={styles.adoptRow}>
                    <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>{t('home.adoptedDial', { kcal: overrideKcal.toLocaleString() })}</ThemedText>
                    <CrispPress onPress={handleRevertBurn} disabled={trueBurnActionBusy} innerStyle={[styles.adoptGhost, { borderColor: hairline }]}>
                      <Text style={[styles.adoptGhostText, { color: theme.muted }]}>{t('home.revert')}</Text>
                    </CrispPress>
                  </View>
                ) : null}
                <ThemedText type="small" themeColor="textSecondary" style={styles.cardHint}>
                  {overrideKcal != null
                    ? t('home.inferredAdopted', { kcal: overrideKcal.toLocaleString() })
                    : showAdoptPrompt
                      ? t('home.inferredAdopting')
                      : t('home.inferredKeep')}
                </ThemedText>
              </>
            ) : (
              <ThemedText type="small" themeColor="textSecondary" style={styles.cardHint}>
                {t('home.untilThen', { reason: adaptive?.reason ?? t('home.unlockBurn') })}
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
                    Full breakdown ›
                  </ThemedText>
                </View>
                <View style={styles.arcRow}>
                  <ArcGauge label="Protein" grams={dayMacros.proteinG} target={goals.proteinG} pct={goals.proteinG ? Math.min(1, dayMacros.proteinG / goals.proteinG) : 0} color={accentText} track={mutedTrack} />
                  <ArcGauge label="Carbs" grams={dayMacros.carbsG} target={goals.carbsG} pct={goals.carbsG ? Math.min(1, dayMacros.carbsG / goals.carbsG) : 0} color={accentText} track={mutedTrack} />
                  <ArcGauge label="Fat" grams={dayMacros.fatG} target={goals.fatG} pct={goals.fatG ? Math.min(1, dayMacros.fatG / goals.fatG) : 0} color={accentText} track={mutedTrack} />
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
              <Text style={[styles.weightBig, { color: accentText }]}>{formatWeightKg(weighIns.length ? weighIns[weighIns.length - 1]!.kg : profile.weightKg, weightUnit)}</Text>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {weightMeta}
            </ThemedText>
            <View style={[styles.waterInputRowFull, { marginTop: 8 }]}>
              <TextInput
                {...keyboard.field('weighIn')}
                value={weighInInput}
                onChangeText={(t) => setWeighInInput(t.replace(/[^0-9.,\s]/g, ''))}
                placeholder={weightUnit === 'kg' ? 'kg' : weightUnit === 'lb' ? 'lb' : 'st lb'}
                placeholderTextColor={theme.muted}
                keyboardType={weightUnit === 'st' ? 'default' : 'numeric'}
                returnKeyType="done"
                onSubmitEditing={handleAddWeighIn}
                style={[styles.waterInputField, { color: theme.text, backgroundColor: isDark ? '#0C1420' : '#FFFFFF', borderColor: weighInInput.length ? accentText : hairline }]}
              />
              <Pressable onPress={handleAddWeighIn} disabled={addingWeighIn || !weighInInput.trim()} style={({ pressed }) => [styles.waterAddButton, { backgroundColor: accentText }, pressed && styles.pressed, (addingWeighIn || !weighInInput.trim()) && styles.buttonDimmed]}>
                <Text style={[styles.waterAddText, { color: isDark ? '#0A1019' : '#fff' }]}>{addingWeighIn ? '…' : t('home.weighIn')}</Text>
              </Pressable>
            </View>
            {targetRecheck?.stale && goals ? (
              <View style={[styles.recheckWrap, { borderColor: accentText, backgroundColor: accentSoft }]}>
                <View style={styles.recheckCopy}>
                  <ThemedText type="smallBold" style={{ color: accentText }}>
                    {t('home.formulaShift')} {targetRecheck.deltaKcal > 0 ? '+' : ''}
                    {targetRecheck.deltaKcal} kcal/day
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('home.recheckBody', { from: goals.calorieTarget.toLocaleString(), to: targetRecheck.next.calorieTarget.toLocaleString(), protein: targetRecheck.next.proteinG, carbs: targetRecheck.next.carbsG, fat: targetRecheck.next.fatG })}
                  </ThemedText>
                </View>
                <CrispPress
                  onPress={() => void handleRecalibrateTargets()}
                  disabled={recalibratingGoals}
                  innerStyle={[styles.adoptPrimary, { backgroundColor: accentText, flex: 0 }]}
                >
                  <Text style={[styles.adoptPrimaryText, { color: isDark ? '#0A1019' : '#fff' }]}>
                    {recalibratingGoals ? '…' : t('home.recalibrate')}
                  </Text>
                </CrispPress>
              </View>
            ) : null}
            <ThemedText type="small" themeColor="textSecondary" style={styles.cardHint}>
              {adaptive?.ready && latestWeighIn
                ? t('home.latestWeighIn', { when: latestWeighInLabel })
                : weighIns.length
                  ? t('home.trueBurnSwitch')
                  : t('home.logWeightStart')}
            </ThemedText>
          </View>
          {keyboard.bottomInset > 0 ? <View style={{ height: keyboard.bottomInset }} /> : null}
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
            onWaterInput={(text) => setWaterInput(normalizeDecimalNumber(text).replace(/[^0-9.]/g, ''))}
            onAdd={() => void handleAddWater()}
            onQuickAdd={(ml) => void handleQuickAddWater(ml)}
            adding={addingWater}
            onUnit={(unit) => {
              setWaterUnit(unit);
              void getUnitPrefs().then((prefs) => saveUnitPrefs({ ...prefs, water: unit }));
            }}
            editValue={editWaterValue}
            onEditValue={(t) => setEditWaterValue(normalizeDecimalNumber(t).replace(/[^0-9.]/g, ''))}
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

          <StreakSheet
            visible={showStreak}
            onClose={() => setShowStreak(false)}
            onClaim={handleClaimStreak}
            streak={activeStreak}
            isDark={isDark}
            accentText={accentText}
            hairline={hairline}
            mutedColor={theme.muted}
            cardBg={isDark ? '#131F2E' : '#FFFFFF'}
            onShare={streakShareCard.eligible ? handleStreakCardShare : undefined}
            shareLabel={cardShare === 'working' ? t('common.preparing') : cardShare === 'error' ? t('common.tryAgain') : undefined}
            sharePreview={
              weeklyCardProps
                ? (selection) => (
                    <ShareCardPreview
                      maxWidth={260}
                      format={selection.format}
                      template={selection.template}
                      {...weeklyCardProps}
                    />
                  )
                : undefined
            }
          />

          {dailyRecap ? (
            <DailyRecapSheet
              visible={showRecap}
              onClose={() => setShowRecap(false)}
              onShare={(format) => void handleRecapShare(format)}
              shareLabel={recapShare === 'working' ? 'Preparing…' : recapShare === 'error' ? 'Try again' : undefined}
              card={dailyRecap.card}
              isDark={isDark}
              accentText={accentText}
              hairline={hairline}
              cardBg={isDark ? '#131F2E' : '#FFFFFF'}
            />
          ) : null}

          {showLogSheet ? (
            <MealLogSheet
              key={editingLog ? `edit-${editingLog.id}` : 'new'}
              visible
              initialMode={firstScanOpen ? 'scan' : undefined}
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

          {loaded && !showLogSheet && (tourDue || tourReplay) ? (
            <AppTour
              onClose={() => {
                setTourDue(false);
                setTourReplay(false);
                void saveTourSeen();
              }}
              isDark={isDark}
              accentText={accentText}
              cardBg={isDark ? '#131F2E' : '#FFFFFF'}
              hairline={hairline}
            />
          ) : null}

          <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
            <Pressable style={styles.modalOverlay} onPress={() => setShowMenu(false)}>
              <View style={styles.menuSheetWrap}>
                <Pressable onPress={() => {}} style={[styles.menuSheet, { backgroundColor: isDark ? '#131F2E' : '#FFFFFF', borderColor: isDark ? 'rgba(255,255,255,0.12)' : hairline }]}>
                  <View style={[styles.pickerHandle, { backgroundColor: isDark ? '#FFFFFF' : '#0A1019' }]} />
                  <ThemedText type="smallBold" style={[styles.menuTitle, { color: theme.muted }]}>{t('home.menu')}</ThemedText>
                  <Pressable
                    onPress={() => {
                      setShowMenu(false);
                      router.push('/settings');
                    }}
                    style={({ pressed }) => [styles.menuItem, { borderColor: hairline }, pressed && styles.pressed]}
                  >
                    <ThemedText type="smallBold">{t('home.settings')}</ThemedText>
                    <Text style={[styles.menuChevron, { color: accentText }]}>›</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setShowMenu(false);
                      router.push('/setup');
                    }}
                    style={({ pressed }) => [styles.menuItem, { borderColor: hairline }, pressed && styles.pressed]}
                  >
                    <ThemedText type="smallBold">{t('home.adjustGoals')}</ThemedText>
                    <Text style={[styles.menuChevron, { color: accentText }]}>›</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setShowMenu(false);
                      router.push({ pathname: '/macros', params: { day: selectedKey } });
                    }}
                    style={({ pressed }) => [styles.menuItem, { borderColor: hairline }, pressed && styles.pressed]}
                  >
                    <ThemedText type="smallBold">{t('home.nutrients')}</ThemedText>
                    <Text style={[styles.menuChevron, { color: accentText }]}>›</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setShowMenu(false);
                      router.push('/trends');
                    }}
                    style={({ pressed }) => [styles.menuItem, { borderColor: hairline }, pressed && styles.pressed]}
                  >
                    <ThemedText type="smallBold">{t('home.trueBurnTrends')}</ThemedText>
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
                    <ThemedText type="smallBold">{t('home.bmi')}</ThemedText>
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
      <View style={[styles.dialCenter, { pointerEvents: 'none' }]}>
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
  track,
}: {
  label: string;
  grams: number;
  target: number;
  pct: number;
  color: string;
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
        <View style={[styles.arcCenter, { pointerEvents: 'none' }]}>
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
  const { t } = useT();
  const w = 240;
  const h = 56;
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
      <View style={styles.sparkLegend}>
        <View style={styles.sparkLegendItem}>
          <View style={[styles.sparkSwatchSolid, { backgroundColor: accentText }]} />
          <ThemedText type="small" style={[styles.sparkLegendText, { color: muted }]}>
            {t('home.measured')}
          </ThemedText>
        </View>
        <View style={styles.sparkLegendItem}>
          <View style={[styles.sparkSwatchDashed, { borderColor: muted }]} />
          <ThemedText type="small" style={[styles.sparkLegendText, { color: muted }]}>
            {t('home.formula')} {est.toLocaleString()}
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

function formatToday(): string {
  return new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

/** "11 September" (plus the year only when it isn't this year) — reads better than an ISO date. */
function formatShortDate(date: Date): string {
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(
    undefined,
    sameYear ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' },
  );
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
  logMealBlock: { gap: 6 },
  logMealHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  logMealLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  logInfo: { flex: 1, gap: 2 },
  logName: {},
  logKcal: { fontSize: 15, fontWeight: '800', fontFamily: Fonts.rounded },
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
  weightCard: { justifyContent: 'flex-start' },
  weightReadout: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 },
  weightBig: { fontSize: 36, fontWeight: '800', letterSpacing: -0.02, fontFamily: Fonts.rounded },
  weightUnit: { fontSize: 16, fontWeight: '600' },
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
  sparkWrap: { alignItems: 'center', gap: 6, marginTop: Spacing.two },
  sparkLegend: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.three },
  sparkLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sparkSwatchSolid: { width: 12, height: 3, borderRadius: 2 },
  sparkSwatchDashed: { width: 12, borderTopWidth: 1.5, borderStyle: 'dashed' },
  sparkLegendText: { fontSize: 10, letterSpacing: 0.2 },
  plateauWrap: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginTop: 8 },
  plateauDot: { color: '#ef4444', fontSize: 9, lineHeight: 17, marginTop: 1 },
  fastReadout: { alignItems: 'center', gap: 2 },
  fastProgressBlock: { gap: 6 },
  fastClock: { fontSize: 36, fontWeight: '800', letterSpacing: -1, fontFamily: Fonts.rounded },
  fastStart: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  fastStartText: { fontSize: 14, fontWeight: '800' },
  fastStop: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  fastStopText: { fontSize: 13, fontWeight: '800' },
  recheckWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 6,
  },
  recheckCopy: { flex: 1, gap: 2 },
  adoptRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 },
  adoptGhost: { borderWidth: 1, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  adoptGhostText: { fontSize: 12, fontWeight: '800' },
  adoptPrimary: { borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14, minHeight: 36, alignItems: 'center', justifyContent: 'center', flex: 1 },
  adoptPrimaryText: { fontSize: 12, fontWeight: '800' },
  footer: { alignItems: 'center', gap: Spacing.three, marginTop: Spacing.two },
  footerLink: { paddingVertical: Spacing.one },
  pressed: { opacity: 0.65 },
  footerNote: { textAlign: 'center', marginTop: Spacing.two, paddingHorizontal: Spacing.three },
});
