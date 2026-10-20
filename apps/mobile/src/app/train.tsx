import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { BrandMark } from '@/components/brand-mark';
import { CrispPress } from '@/components/crisp-press';
import { EatTrainSwitch } from '@/components/eat-train-switch';
import { HeaderGlyphButton, HeaderMenuButton, StreakFireMark, WaterDropMark } from '@/components/header-glyphs';
import { MuscleFigures } from '@/components/muscle-figures';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand } from '@/constants/app';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useKeyboardReveal, type KeyboardFieldProps } from '@/hooks/use-keyboard-reveal';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import {
  addWorkoutSession,
  dayKey,
  deleteWorkoutSession,
  getAllWorkouts,
  getProfile,
  getUnitPrefs,
  getWaterForDay,
  getWeighIns,
  getWorkoutSessionsForDay,
  type Profile,
  type WorkoutSession,
} from '@/lib/db';
import { ROUTINE_NAME_MAX, addRoutine, isE1RMPR, isWeightPRAtReps, prefillFromLast, weeklyVolumeByExercise, type Routine } from '@/lib/routines';
import { loadRoutines, saveRoutines } from '@/lib/routines-store';
import {
  exercisesForMuscleAndEquipment,
  exercisesGrouped,
  getExercise,
  hasPickedExercise,
  listedMuscles,
  muscleLabel,
  type Equipment,
  type ExerciseId,
  type MuscleSlug,
} from '@/lib/muscles';
import { bmr, resolveBmiWeight } from '@/lib/nutrition';
import { expireStreak, streakNeedsClaim } from '@/lib/streak';
import { loadStreak } from '@/lib/streak-store';
import { formatWeightKg, parseWeightInput, waterGoalMl, weightFromKg, type WeightUnit } from '@/lib/units';
import {
  clampReps,
  clampSets,
  clampWeightKg,
  epleyE1RM,
  formatDurationSec,
  formatRestCountdown,
  restSecFor,
  sessionDurationSec,
  sessionKcal,
  sessionVolumeKg,
} from '@/lib/workout';

const REST_TICK_MS = 1000;

export default function TrainScreen() {
  const { t } = useT();
  const keyboard = useKeyboardReveal();
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const theme = useTheme();
  const [exerciseId, setExerciseId] = useState<ExerciseId | null>(null);
  const [equipment, setEquipment] = useState<Equipment>('free');
  const [muscleFilter, setMuscleFilter] = useState<MuscleSlug | null>(null);
  const [setsText, setSetsText] = useState('3');
  const [repsText, setRepsText] = useState('10');
  const [weightText, setWeightText] = useState('');
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [weighIns, setWeighIns] = useState<{ kg: number; measuredAt: string }[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  /** Full history for the volume/e1RM sparkline (filtered to selected lift). */
  const [history, setHistory] = useState<WorkoutSession[]>([]);
  const [loaded, setLoaded] = useState(false);
  /** Header glyphs mirror Home's streak and water so the buttons read the same. */
  const [headerStreak, setHeaderStreak] = useState({ count: 0, live: false });
  const [waterPct, setWaterPct] = useState(0);
  const [logging, setLogging] = useState(false);
  /** Floating rest countdown: seconds remaining after last Add. */
  const [restLeft, setRestLeft] = useState<number | null>(null);
  /** Saved routines (Train v2), loaded from local storage. */
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [activeRoutineId, setActiveRoutineId] = useState<string | null>(null);
  const [routineName, setRoutineName] = useState('');
  const [routineError, setRoutineError] = useState<string | null>(null);
  /** Shown after a per-set log when the set beats earlier history. */
  const [prNote, setPrNote] = useState<string | null>(null);

  const todayKey = dayKey();

  const reloadDay = useCallback(async () => {
    const [p, w, daySessions, prefs, all, saved, streakSaved, waterMl] = await Promise.all([
      getProfile(),
      getWeighIns(),
      getWorkoutSessionsForDay(todayKey),
      getUnitPrefs(),
      getAllWorkouts(),
      loadRoutines(),
      loadStreak(),
      getWaterForDay(todayKey),
    ]);
    setRoutines(saved);
    setProfile(p);
    setWeighIns(w);
    const now = Date.now();
    const activeStreak = expireStreak(streakSaved, now);
    setHeaderStreak({ count: activeStreak.current, live: streakNeedsClaim(activeStreak, now) });
    const latestKg = w.length ? w[w.length - 1]!.kg : p?.weightKg;
    const goal = latestKg ? waterGoalMl(latestKg) : 0;
    setWaterPct(goal ? Math.min(1, waterMl / goal) : 0);
    setSessions(daySessions);
    setHistory(all);
    setWeightUnit(prefs.weight);
    setLoaded(true);
  }, [todayKey]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        await reloadDay();
        if (cancelled) return;
      })();
      return () => {
        cancelled = true;
      };
    }, [reloadDay]),
  );

  // Rest timer ticks once a second when armed.
  useEffect(() => {
    if (restLeft == null || restLeft <= 0) return;
    const id = setInterval(() => setRestLeft((v) => (v == null || v <= 1 ? null : v - 1)), REST_TICK_MS);
    return () => clearInterval(id);
  }, [restLeft]);

  const sessionBmr = useMemo(() => {
    if (!profile) return null;
    const weight = resolveBmiWeight(
      profile.weightKg,
      weighIns.map((w) => ({ kg: w.kg, at: w.measuredAt })),
    );
    return bmr({
      sex: profile.sex,
      ageYears: profile.ageYears,
      heightCm: profile.heightCm,
      weightKg: weight.kg,
    });
  }, [profile, weighIns]);

  const accent = isDark ? Brand.lime : Brand.primaryDeep;
  const cardBg = isDark ? '#131D2D' : '#FFFFFF';
  const hairline = theme.line;
  const glyphBg = isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF';
  /** Home owns the water and streak sheets, so these buttons route there with a sheet param. */
  const openHomeSheet = (sheet: 'water' | 'streak' | 'menu') => router.push({ pathname: '/home', params: { sheet } });
  const picked = hasPickedExercise(exerciseId);
  const exercise = picked ? getExercise(exerciseId) : undefined;
  const listed = picked ? listedMuscles(exerciseId) : [];
  const primary = listed.filter((m) => m.role === 'primary');
  const assisting = listed.filter((m) => m.role === 'assisting');

  const sets = clampSets(Number(setsText));
  const reps = clampReps(Number(repsText));
  // The field is labelled in the user's chosen unit, so the typed number has to
  // be converted from it — reading "88" under a "Weight (lb)" label as 88 kg
  // logged 194 lb. parseWeightInput is the same reader the Home weigh-in uses.
  const weightKg = clampWeightKg(parseWeightInput(weightText, weightUnit) ?? 0);
  const durationSec = picked ? sessionDurationSec(exerciseId, sets, reps) : 0;
  const restSec = picked ? restSecFor(exerciseId) : 60;

  const previewKcal =
    picked && sessionBmr != null ? sessionKcal({ bmr: sessionBmr, exerciseId, sets, reps }) : 0;
  const previewVolume = picked ? sessionVolumeKg({ sets, reps, weightKg }) : 0;
  const previewE1 = picked && weightKg > 0 ? epleyE1RM(weightKg, reps) : 0;
  const todayKcal = sessions.reduce((sum, s) => sum + s.kcal, 0);
  const canLog = picked && Boolean(profile) && sets > 0 && reps > 0 && !logging;
  // One set doesn't use the Sets field, so a blank Sets box must not disable it.
  const canLogOne = picked && sessionBmr != null && reps > 0 && !logging;
  /** The most recent logged set for this lift; null until the lift has history. */
  const lastLiftSet = useMemo(() => {
    if (!picked) return null;
    return prefillFromLast(
      history.filter((s) => s.exerciseId === exerciseId).map((s) => ({ weightKg: s.weightKg ?? 0, reps: s.reps })),
    );
  }, [history, picked, exerciseId]);

  // History for the sparkline: only the selected lift, oldest → newest, max 24 points.
  const liftHistory = useMemo(() => {
    if (!picked) return [];
    return history.filter((s) => s.exerciseId === exerciseId).slice(-24);
  }, [history, picked, exerciseId]);
  const volumePoints = useMemo(() => liftHistory.map((s) => s.volumeKg), [liftHistory]);
  const hasVolumeSignal = volumePoints.some((v) => v > 0);

  // Weekly (Mon–Sun) volume for the selected lift, from the per-set rows.
  const weekVolumeKg = useMemo(() => {
    if (!picked) return 0;
    const byLift = weeklyVolumeByExercise(
      history.map((s) => ({ dayKey: s.dayKey, exerciseId: s.exerciseId, sets: s.sets, reps: s.reps, weightKg: s.weightKg ?? 0 })),
      todayKey,
    );
    return byLift[exerciseId ?? ''] ?? 0;
  }, [history, picked, exerciseId, todayKey]);
  const activeRoutine = routines.find((r) => r.id === activeRoutineId) ?? null;

  // Exercise list: when muscleFilter set, show only lifts that hit that muscle.
  const groupedExercises = useMemo(() => {
    if (muscleFilter) {
      const lifts = exercisesForMuscleAndEquipment(muscleFilter, equipment);
      if (!lifts.length) return [];
      // Keep familiar group headings by filtering the normal groups to this subset.
      const subset = new Set(lifts.map((l) => l.id));
      return exercisesGrouped(equipment).flatMap((g) => {
        const filtered = g.exercises.filter((ex) => subset.has(ex.id));
        return filtered.length ? [{ id: g.id, name: g.name, exercises: filtered }] : [];
      });
    }
    return exercisesGrouped(equipment);
  }, [equipment, muscleFilter]);
  const muscleFilterLabel = muscleFilter ? muscleLabel(muscleFilter) : null;

  async function logSession() {
    if (!profile || !canLog || !picked) return;
    setLogging(true);
    try {
      await addWorkoutSession({
        dayKey: todayKey,
        exerciseId,
        sets,
        reps,
        kcal: previewKcal,
        weightKg,
        volumeKg: previewVolume,
        e1RMKg: previewE1,
      });
      setRestLeft(restSec);
      await reloadDay();
    } finally {
      setLogging(false);
    }
  }

  /** One set at a time: the set's own kcal (one extra set, including the rest after it). */
  async function logOneSet() {
    if (!profile || !picked || logging || sessionBmr == null || reps <= 0) return;
    setLogging(true);
    setPrNote(null);
    try {
      const prior = history
        .filter((s) => s.exerciseId === exerciseId)
        .map((s) => ({ weightKg: s.weightKg ?? 0, reps: s.reps }));
      const candidate = { weightKg, reps };
      const setKcal =
        sessionKcal({ bmr: sessionBmr, exerciseId, sets: 2, reps }) -
        sessionKcal({ bmr: sessionBmr, exerciseId, sets: 1, reps });
      await addWorkoutSession({
        dayKey: todayKey,
        exerciseId,
        sets: 1,
        reps,
        kcal: setKcal,
        weightKg,
        volumeKg: sessionVolumeKg({ sets: 1, reps, weightKg }),
        e1RMKg: epleyE1RM(weightKg, reps),
      });
      if (isWeightPRAtReps(prior, candidate)) setPrNote(`New PR · heaviest at ${reps} reps`);
      else if (isE1RMPR(prior, candidate)) setPrNote('New PR · best estimated 1RM');
      setRestLeft(restSec);
      await reloadDay();
    } finally {
      setLogging(false);
    }
  }

  /** Fills weight and reps from the last set logged for this lift. */
  function repeatLastSet() {
    if (!lastLiftSet) return;
    if (lastLiftSet.weightKg > 0) {
      // Stone is typed as "stones,pounds" (see the placeholder), not a single number.
      const w = weightFromKg(lastLiftSet.weightKg, weightUnit);
      setWeightText(weightUnit === 'st' ? `${w.stones},${w.pounds}` : String(w.value));
    } else {
      // Bodyweight last time: clear the field so an old weight isn't kept.
      setWeightText('');
    }
    setRepsText(String(lastLiftSet.reps));
  }

  function selectRoutineItem(id: string, defaultSets: number) {
    const ex = getExercise(id as ExerciseId);
    if (!ex) return;
    setEquipment(ex.equipment);
    setExerciseId(id as ExerciseId);
    setSetsText(String(defaultSets));
    setMuscleFilter(null);
    setPrNote(null);
  }

  function startRoutine(r: Routine) {
    const first = r.items[0];
    if (!first) return;
    setActiveRoutineId(r.id);
    selectRoutineItem(first.exerciseId, first.defaultSets);
  }

  /** Saves today's lifts; each exercise's default sets is the number of sets logged today. */
  async function saveTodayAsRoutine() {
    const setsByExercise = new Map<string, number>();
    for (const s of sessions) setsByExercise.set(s.exerciseId, (setsByExercise.get(s.exerciseId) ?? 0) + s.sets);
    const result = addRoutine(routines, {
      id: `r${Date.now().toString(36)}`,
      name: routineName,
      createdAt: new Date().toISOString(),
      items: [...setsByExercise.entries()].map(([exerciseId, defaultSets]) => ({ exerciseId, defaultSets })),
    });
    if (!result.ok) {
      setRoutineError(result.error);
      return;
    }
    await saveRoutines(result.routines);
    setRoutines(result.routines);
    setRoutineName('');
    setRoutineError(null);
  }

  async function removeSession(id: number) {
    await deleteWorkoutSession(id);
    await reloadDay();
  }

  function bump(kind: 'sets' | 'reps', delta: number) {
    if (kind === 'sets') setSetsText(String(clampSets((sets || 0) + delta)));
    else setRepsText(String(clampReps((reps || 0) + delta)));
  }

  function handleMusclePress(slug: MuscleSlug) {
    // Tapping the same muscle clears the filter — second tap is an undo.
    setMuscleFilter((prev) => (prev === slug ? null : slug));
  }

  // Weight display respects user's unit pref; stored as kg.
  const weightPlaceholder = weightUnit;
  const displayWeightFor = (kg: number) => (kg === 0 ? '—' : formatWeightKg(kg, weightUnit));

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        {/* Floating rest pill — anchored above the tab switch, stays visible across scroll. */}
        {restLeft != null ? (
          <View pointerEvents="box-none" style={styles.restPillWrap}>
            <View
              style={[
                styles.restPill,
                {
                  backgroundColor: isDark ? '#0A1019' : '#0E6B38',
                  borderColor: isDark ? 'rgba(183,233,60,0.35)' : 'rgba(255,255,255,0.35)',
                },
              ]}
            >
              <Text style={[styles.restPillLabel, { color: isDark ? Brand.lime : '#FFFFFF' }]}>
                Rest {formatRestCountdown(restLeft)}
              </Text>
              <Pressable
                onPress={() => setRestLeft(null)}
                hitSlop={8}
                accessibilityLabel={t('train.dismissRest')}
                accessibilityRole="button"
                style={styles.restPillClose}
              >
                <Text style={[styles.restPillCloseText, { color: isDark ? Brand.lime : '#FFFFFF' }]}>✕</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Pinned header: logo + Eat/Train switch stay visible while the workout list scrolls. */}
        <View style={styles.pinned}>
          <View style={styles.header}>
            <BrandMark size={28} />
            <View style={styles.headerRight}>
              <HeaderGlyphButton label="Daily streak" onPress={() => openHomeSheet('streak')} borderColor={hairline} backgroundColor={glyphBg}>
                <StreakFireMark live={headerStreak.live} count={headerStreak.count} color={headerStreak.live ? '#EA580C' : '#9A3412'} />
              </HeaderGlyphButton>
              <HeaderGlyphButton label="Add water" onPress={() => openHomeSheet('water')} borderColor={hairline} backgroundColor={glyphBg}>
                <WaterDropMark fill={waterPct} color={isDark ? '#38BDF8' : '#0284C7'} />
              </HeaderGlyphButton>
              <HeaderMenuButton onPress={() => openHomeSheet('menu')} borderColor={hairline} backgroundColor={glyphBg} lineColor={theme.text} />
            </View>
          </View>
          <EatTrainSwitch
            value="train"
            isDark={isDark}
            onChange={(mode) => {
              if (mode === 'eat') router.replace('/home');
            }}
          />
        </View>

        <ScrollView {...keyboard.scrollProps} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {!picked ? (
            <ThemedText type="small" themeColor="textSecondary">
              Pick a workout to see the muscles it uses. {muscleFilterLabel ? `Showing ${muscleFilterLabel} lifts.` : 'Or tap a muscle on the figure below.'}
            </ThemedText>
          ) : null}

          <EquipmentSwitch
            value={equipment}
            onChange={(next) => {
              setEquipment(next);
              setExerciseId((id) => (id && getExercise(id)?.equipment === next ? id : null));
            }}
            isDark={isDark}
          />

          {muscleFilterLabel ? (
            <Pressable
              onPress={() => setMuscleFilter(null)}
              style={[styles.filterPill, { borderColor: accent, backgroundColor: isDark ? 'rgba(183,233,60,0.12)' : 'rgba(14,107,56,0.08)' }]}
              accessibilityRole="button"
              accessibilityLabel={`Clear filter: ${muscleFilterLabel}`}
            >
              <ThemedText type="smallBold" style={{ color: accent }}>
                {muscleFilterLabel} ✕ clear
              </ThemedText>
            </Pressable>
          ) : null}

          {groupedExercises.length === 0 && muscleFilterLabel ? (
            <ThemedText type="small" themeColor="textSecondary">
              No {muscleFilterLabel.toLowerCase()} lifts on {equipment === 'free' ? 'free weights' : 'machines'} — try switching equipment.
            </ThemedText>
          ) : null}

          {groupedExercises.map((group) => (
            <View key={group.id} style={styles.group}>
              <ThemedText type="smallBold" style={[styles.section, { color: accent }]}>
                {group.name}
              </ThemedText>
              {group.exercises.map((ex) => {
                const on = picked && ex.id === exerciseId;
                return (
                  <Pressable
                    key={`${group.id}-${ex.id}`}
                    onPress={() => setExerciseId(ex.id)}
                    style={[
                      styles.row,
                      { borderColor: on ? accent : hairline, backgroundColor: on ? (isDark ? 'rgba(183,233,60,0.12)' : 'rgba(14,107,56,0.08)') : 'transparent' },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={ex.name}
                  >
                    <ThemedText type="smallBold">{ex.name}</ThemedText>
                    <Text style={[styles.chevron, { color: accent }]}>›</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}

          {picked && exercise ? (
            <>
              <ThemedText type="smallBold" style={[styles.kicker, { color: accent }]}>
                {exercise.name}
              </ThemedText>

              <View style={[styles.figureWell, { backgroundColor: cardBg, borderColor: hairline }]}>
                <MuscleFigures exerciseId={exerciseId} isDark={isDark} onMusclePress={handleMusclePress} />
                <ThemedText type="small" themeColor="textSecondary" style={styles.figureHint}>
                  Tap a muscle on the figure to filter lifts.
                </ThemedText>
              </View>

              <ThemedText type="smallBold" style={[styles.section, { color: theme.muted }]}>
                Primary
              </ThemedText>
              {primary.map((m) => (
                <Pressable
                  key={m.slug}
                  onPress={() => handleMusclePress(m.slug)}
                  style={[styles.row, { borderColor: hairline }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Show ${m.name} lifts`}
                >
                  <ThemedText type="smallBold">{m.name}</ThemedText>
                  <View style={styles.rowMeta}>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.plate}>
                      {m.plate}
                    </ThemedText>
                    <View style={[styles.dot, { backgroundColor: Brand.lime }]} />
                  </View>
                </Pressable>
              ))}

              {assisting.length ? (
                <>
                  <ThemedText type="smallBold" style={[styles.section, { color: theme.muted }]}>
                    Assisting
                  </ThemedText>
                  {assisting.map((m) => (
                    <Pressable
                      key={m.slug}
                      onPress={() => handleMusclePress(m.slug)}
                      style={[styles.row, { borderColor: hairline }]}
                      accessibilityRole="button"
                      accessibilityLabel={`Show ${m.name} lifts`}
                    >
                      <ThemedText type="smallBold">{m.name}</ThemedText>
                      <View style={styles.rowMeta}>
                        <ThemedText type="small" themeColor="textSecondary" style={styles.plate}>
                          {m.plate}
                        </ThemedText>
                        <View style={[styles.dot, { backgroundColor: '#4A7A22' }]} />
                      </View>
                    </Pressable>
                  ))}
                </>
              ) : null}

              <View style={[styles.sessionCard, { backgroundColor: cardBg, borderColor: hairline }]}>
                <ThemedText type="smallBold" style={[styles.section, styles.cardKicker, { color: theme.muted }]}>
                  This session
                </ThemedText>
                <View style={styles.stepperRow}>
                  <CountStepper
                    label="Sets"
                    value={setsText}
                    onChange={setSetsText}
                    onBump={(d) => bump('sets', d)}
                    accent={accent}
                    theme={theme}
                    inputProps={keyboard.field('sets')}
                  />
                  <CountStepper
                    label="Reps"
                    value={repsText}
                    onChange={setRepsText}
                    onBump={(d) => bump('reps', d)}
                    accent={accent}
                    theme={theme}
                    inputProps={keyboard.field('reps')}
                  />
                </View>

                {/* Weight — optional, powers volume & e1RM. */}
                <View style={styles.weightRow}>
                  <ThemedText type="smallBold" style={[styles.stepperLabel, { color: theme.muted }]}>
                    Weight ({weightPlaceholder})
                  </ThemedText>
                  <View style={styles.weightControls}>
                    <TextInput
                      {...keyboard.field('weight')}
                      value={weightText}
                      onChangeText={(text) => setWeightText(text.replace(/[^0-9.,]/g, ''))}
                      placeholder={weightUnit === 'kg' ? 'e.g. 40' : weightUnit === 'lb' ? 'e.g. 88' : 'e.g. 9,6'}
                      placeholderTextColor={theme.muted}
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      selectTextOnFocus
                      style={[
                        styles.weightInput,
                        {
                          color: theme.text,
                          backgroundColor: theme.inputBackground,
                          borderColor: theme.lineStrong,
                        },
                      ]}
                      accessibilityLabel={`Weight in ${weightPlaceholder}`}
                    />
                    {weightText.trim() !== '' ? (
                      <Pressable
                        onPress={() => setWeightText('')}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={t('train.clearWeight')}
                        style={styles.weightClear}
                      >
                        <ThemedText type="smallBold" style={{ color: theme.muted }}>
                          ✕
                        </ThemedText>
                      </Pressable>
                    ) : null}
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">
                    {weightKg > 0
                      ? `${previewVolume.toLocaleString()} kg volume · e1RM ${previewE1.toLocaleString()} kg`
                      : 'Leave empty for bodyweight — add weight to track volume.'}
                  </ThemedText>
                </View>

                {!loaded ? null : !profile ? (
                  <View style={styles.estimateBlock}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Finish setup so we can estimate extra kcal from your age, weight and sex. Nothing is invented until then.
                    </ThemedText>
                    <Pressable onPress={() => router.push('/setup')} accessibilityRole="link" accessibilityLabel="Open setup">
                      <ThemedText type="smallBold" style={{ color: accent }}>
                        Open setup ›
                      </ThemedText>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.estimateBlock}>
                    <View style={styles.estimateHero}>
                      <Text style={[styles.kcalNumber, { color: accent }]}>{previewKcal}</Text>
                      <ThemedText type="smallBold">kcal estimate</ThemedText>
                    </View>
                    <ThemedText type="small" themeColor="textSecondary">
                      {exerciseId === 'plank'
                        ? `${sets} × ${reps} · each rep is ~20s hold · ${formatDurationSec(durationSec)} · ${restSec}s rest · from your profile. Tracked alongside your daily intake.`
                        : `${sets} × ${reps}${weightKg > 0 ? ` @ ${displayWeightFor(weightKg)}` : ''} · ${formatDurationSec(durationSec)} · ${restSec}s rest · from your profile (age, sex, height, weight). Tracked alongside your daily intake.`}
                    </ThemedText>
                  </View>
                )}

                <CrispPress
                  onPress={logSession}
                  disabled={!canLog}
                  innerStyle={[styles.logButton, { backgroundColor: accent }]}
                  accessibilityLabel="Add this session to the tracker"
                >
                  <Text style={[styles.logButtonText, { color: isDark ? '#0A1019' : '#FFFFFF' }]}>
                    {logging ? 'Adding…' : 'Add to tracker'}
                  </Text>
                </CrispPress>

                <View style={styles.setRow}>
                  <CrispPress
                    onPress={repeatLastSet}
                    disabled={!lastLiftSet}
                    style={styles.setButtonSlot}
                    innerStyle={[styles.setButton, { borderColor: accent }]}
                    accessibilityLabel="Repeat your last set"
                  >
                    <Text style={[styles.setButtonText, { color: accent }]}>{t('train.startRest')}</Text>
                  </CrispPress>
                  <CrispPress
                    onPress={logOneSet}
                    disabled={!canLogOne}
                    style={styles.setButtonSlot}
                    innerStyle={[styles.setButton, { borderColor: accent, backgroundColor: accent }]}
                    accessibilityLabel={t('train.logSet')}
                  >
                    <Text style={[styles.setButtonText, { color: isDark ? '#0A1019' : '#FFFFFF' }]}>{t('train.logSet')}</Text>
                  </CrispPress>
                </View>
                {prNote ? (
                  <ThemedText type="smallBold" style={{ color: accent }}>
                    {prNote}
                  </ThemedText>
                ) : null}
                {weekVolumeKg > 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    This week · {weekVolumeKg.toLocaleString()} kg volume
                  </ThemedText>
                ) : null}

                {/* Volume / e1RM sparkline for this lift — same visual language as True Burn. */}
                {liftHistory.length >= 2 ? (
                  <View style={styles.chartBlock}>
                    <View style={styles.chartHead}>
                      <ThemedText type="smallBold" style={[styles.chartLabel, { color: theme.muted }]}>
                        {hasVolumeSignal ? 'VOLUME' : 'E1RM'} · {exercise.name}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {liftHistory.length} sessions
                      </ThemedText>
                    </View>
                    <VolumeChart
                      points={hasVolumeSignal ? volumePoints : liftHistory.map((s) => s.e1RMKg)}
                      accent={accent}
                      accentText={accent}
                      unit=" kg"
                    />
                    <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                      {hasVolumeSignal
                        ? 'Volume = sets × reps × weight. More volume at the same weight is progress.'
                        : 'No weight logged yet — the dotted trend is e1RM (estimated 1-rep max) once you add weight.'}
                    </ThemedText>
                  </View>
                ) : liftHistory.length === 1 ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                    One session logged — log again to draw the trend.
                  </ThemedText>
                ) : null}
              </View>
            </>
          ) : null}

          <ThemedText type="smallBold" style={[styles.section, { color: theme.muted }]}>
            Routines
          </ThemedText>
          {activeRoutine ? (
            <View style={styles.chipRow}>
              {activeRoutine.items.map((item) => {
                const name = getExercise(item.exerciseId as ExerciseId)?.name ?? item.exerciseId;
                return (
                  <Pressable
                    key={item.exerciseId}
                    onPress={() => selectRoutineItem(item.exerciseId, item.defaultSets)}
                    style={[styles.chip, { borderColor: accent }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Go to ${name}`}
                  >
                    <Text style={[styles.chipText, { color: accent }]}>{name}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          {routines.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Save the lifts you log today as a routine, then start it in one tap next time.
            </ThemedText>
          ) : (
            <View style={styles.chipRow}>
              {routines.map((r) => (
                <Pressable
                  key={r.id}
                  onPress={() => startRoutine(r)}
                  style={[styles.chip, { borderColor: accent }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Start routine ${r.name}`}
                >
                  <Text style={[styles.chipText, { color: accent }]}>{r.name}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {sessions.length > 0 ? (
            <View style={styles.saveRoutineRow}>
              <TextInput
                {...keyboard.field('routineName')}
                value={routineName}
                onChangeText={(t) => {
                  setRoutineName(t);
                  setRoutineError(null);
                }}
                placeholder={t('train.routineName')}
                placeholderTextColor={theme.muted}
                maxLength={ROUTINE_NAME_MAX}
                style={[styles.routineInput, { color: theme.text, borderColor: hairline }]}
              />
              <CrispPress
                onPress={saveTodayAsRoutine}
                innerStyle={[styles.setButton, { borderColor: accent, backgroundColor: accent }]}
                accessibilityLabel="Save today's lifts as a routine"
              >
                <Text style={[styles.setButtonText, { color: isDark ? '#0A1019' : '#FFFFFF' }]}>Save</Text>
              </CrispPress>
            </View>
          ) : null}
          {routineError ? (
            <ThemedText type="small" style={{ color: Brand.danger }}>
              {routineError}
            </ThemedText>
          ) : null}

          <ThemedText type="smallBold" style={[styles.section, { color: theme.muted }]}>
            Today · {todayKcal} kcal trained
          </ThemedText>
          {sessions.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Nothing logged yet. Stays on this device only.
            </ThemedText>
          ) : (
            sessions.map((session) => {
              const exName = getExercise(session.exerciseId)?.name ?? session.exerciseId;
              const vol = session.volumeKg ?? 0;
              const e1 = session.e1RMKg ?? 0;
              const wt = (session as WorkoutSession & { weightKg?: number }).weightKg ?? 0;
              return (
                <View key={session.id} style={[styles.row, { borderColor: hairline }]}>
                  <View style={styles.sessionMeta}>
                    <ThemedText type="smallBold">{exName}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {session.sets} × {session.reps}
                      {wt > 0 ? ` @ ${displayWeightFor(wt)}` : ''} · {session.kcal} kcal{vol > 0 ? ` · ${vol.toLocaleString()} kg vol` : ''}{e1 > 0 ? ` · e1RM ${e1.toLocaleString()} kg` : ''}
                    </ThemedText>
                  </View>
                  <Pressable
                    onPress={() => removeSession(session.id)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${exName}`}
                  >
                    <ThemedText type="smallBold" style={{ color: theme.muted }}>
                      Remove
                    </ThemedText>
                  </Pressable>
                </View>
              );
            })
          )}
          {keyboard.bottomInset > 0 ? <View style={{ height: keyboard.bottomInset }} /> : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function VolumeChart({
  points,
  accent,
  accentText,
  unit,
}: {
  points: number[];
  accent: string;
  accentText: string;
  unit: string;
}) {
  const w = 300;
  const h = 90;
  const padX = 8;
  const padY = 10;
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const span = Math.max(1, hi - lo);
  const xs = points.map((_, i) => padX + (i / Math.max(1, points.length - 1)) * (w - padX * 2));
  const ys = points.map((v) => padY + (1 - (v - lo) / span) * (h - padY * 2));
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ys[i]!.toFixed(1)}`).join(' ');

  return (
    <View style={styles.chartWrap}>
      <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}>
        <Defs>
          <LinearGradient id="volFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={accentText} stopOpacity={0.18} />
            <Stop offset="1" stopColor={accentText} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {path ? <Path d={`${path} L ${xs[xs.length - 1]!.toFixed(1)} ${h - padY} L ${xs[0]!.toFixed(1)} ${h - padY} Z`} fill="url(#volFill)" /> : null}
        {path ? <Path d={path} stroke={accent} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {xs.map((x, i) => (
          <Circle key={i} cx={x} cy={ys[i]} r={2.5} fill={accentText} />
        ))}
      </Svg>
      <View style={styles.chartAxis}>
        <ThemedText type="small" themeColor="textSecondary">
          {points[0]?.toLocaleString() ?? ''}
          {unit}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {points[points.length - 1]?.toLocaleString() ?? ''}
          {unit}
        </ThemedText>
      </View>
    </View>
  );
}

function EquipmentSwitch({
  value,
  onChange,
  isDark,
}: {
  value: Equipment;
  onChange: (next: Equipment) => void;
  isDark: boolean;
}) {
  const on = isDark ? Brand.lime : Brand.primaryDeep;
  const onText = isDark ? '#0A1019' : '#F6F7F4';
  const offText = isDark ? '#7D8A96' : '#67727C';
  const track = isDark ? '#0E1623' : '#FFFFFF';
  const line = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(13, 21, 30, 0.09)';

  return (
    <View style={styles.equipTrack}>
      <View style={[styles.equipInner, { backgroundColor: track, borderColor: line }]}>
        <Pressable
          onPress={() => onChange('free')}
          style={[styles.equipSlot, value === 'free' && { backgroundColor: on }]}
          accessibilityRole="button"
          accessibilityState={{ selected: value === 'free' }}
          accessibilityLabel="Free weights and bodyweight"
        >
          <Text style={[styles.equipLabel, { color: value === 'free' ? onText : offText }]}>Free</Text>
        </Pressable>
        <Pressable
          onPress={() => onChange('machine')}
          style={[styles.equipSlot, value === 'machine' && { backgroundColor: on }]}
          accessibilityRole="button"
          accessibilityState={{ selected: value === 'machine' }}
          accessibilityLabel="Machines"
        >
          <Text style={[styles.equipLabel, { color: value === 'machine' ? onText : offText }]}>Machines</Text>
        </Pressable>
      </View>
    </View>
  );
}

function CountStepper({
  label,
  value,
  onChange,
  onBump,
  accent,
  theme,
  inputProps,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  onBump: (delta: number) => void;
  accent: string;
  theme: { text: string; muted: string; inputBackground: string; lineStrong: string };
  inputProps: KeyboardFieldProps;
}) {
  return (
    <View style={styles.stepper}>
      <ThemedText type="smallBold" style={[styles.stepperLabel, { color: theme.muted }]}>
        {label}
      </ThemedText>
      <View style={styles.stepperControls}>
        <Pressable
          onPress={() => onBump(-1)}
          style={[styles.stepBtn, { borderColor: theme.lineStrong }]}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
        >
          <Text style={[styles.stepBtnText, { color: accent }]}>−</Text>
        </Pressable>
        <TextInput
          {...inputProps}
          value={value}
          onChangeText={(text) => onChange(text.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          inputMode="numeric"
          selectTextOnFocus
          style={[
            styles.stepInput,
            {
              color: theme.text,
              backgroundColor: theme.inputBackground,
              borderColor: theme.lineStrong,
            },
          ]}
          accessibilityLabel={label}
        />
        <Pressable
          onPress={() => onBump(1)}
          style={[styles.stepBtn, { borderColor: theme.lineStrong }]}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
        >
          <Text style={[styles.stepBtnText, { color: accent }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pinned: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  restPillWrap: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  restPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  restPillLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 0.2 },
  restPillClose: { paddingHorizontal: 4, paddingVertical: 2 },
  restPillCloseText: { fontSize: 14, fontWeight: '800' },
  kicker: {
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginTop: Spacing.two,
  },
  filterPill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  equipTrack: { marginTop: Spacing.two },
  equipInner: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  equipSlot: {
    flex: 1,
    borderRadius: 9,
    paddingVertical: 8,
    alignItems: 'center',
  },
  equipLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  figureWell: {
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.one,
    marginTop: Spacing.two,
    overflow: 'visible',
    gap: Spacing.two,
  },
  figureHint: { textAlign: 'center', fontSize: 11 },
  section: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: Spacing.two,
  },
  cardKicker: { marginTop: 0 },
  sessionCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: Spacing.three,
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  stepperRow: { flexDirection: 'row', gap: Spacing.three },
  stepper: { flex: 1, gap: Spacing.two },
  stepperLabel: { fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase' },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stepBtn: {
    width: 40,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontSize: 22, fontWeight: '600', lineHeight: 24 },
  stepInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
  },
  weightRow: { gap: Spacing.two },
  weightControls: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  weightInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '700',
  },
  weightClear: { paddingHorizontal: 8, paddingVertical: 8 },
  estimateBlock: { gap: Spacing.two },
  estimateHero: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  kcalNumber: { fontSize: 36, fontWeight: '800', letterSpacing: -0.5, lineHeight: 40 },
  logButton: {
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logButtonText: { fontSize: 15, fontWeight: '800' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  chipText: { fontSize: 14, fontWeight: '600' },
  saveRoutineRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  routineInput: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16 },
  setRow: { flexDirection: 'row', gap: Spacing.two },
  setButtonSlot: { flex: 1 },
  setButton: { flex: 1, borderWidth: 1, borderRadius: 999, alignItems: 'center', paddingVertical: Spacing.two },
  setButtonText: { fontSize: 15, fontWeight: '700' },
  chartBlock: { gap: Spacing.two, paddingTop: Spacing.one, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(128,138,148,0.2)' },
  chartHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chartLabel: { fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase' },
  chartWrap: { gap: 4 },
  chartAxis: { flexDirection: 'row', justifyContent: 'space-between' },
  hint: { lineHeight: 17, fontSize: 12 },
  sessionMeta: { flex: 1, gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  plate: { fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
  dot: { width: 8, height: 8, borderRadius: 99 },
  group: { gap: Spacing.two, marginTop: Spacing.one },
  chevron: { fontSize: 18, fontWeight: '600' },
});
