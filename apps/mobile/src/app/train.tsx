import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CrispPress } from '@/components/crisp-press';
import { EatTrainSwitch } from '@/components/eat-train-switch';
import { MuscleFigures } from '@/components/muscle-figures';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand } from '@/constants/app';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import {
  addWorkoutSession,
  dayKey,
  deleteWorkoutSession,
  getProfile,
  getWeighIns,
  getWorkoutSessionsForDay,
  type Profile,
  type WorkoutSession,
} from '@/lib/db';
import { useLicense } from '@/lib/license-context';
import { exercisesGrouped, getExercise, hasPickedExercise, listedMuscles, type Equipment, type ExerciseId } from '@/lib/muscles';
import { bmr, resolveBmiWeight } from '@/lib/nutrition';
import { clampReps, clampSets, formatDurationSec, sessionDurationSec, sessionKcal } from '@/lib/workout';

export default function TrainScreen() {
  const { license } = useLicense();
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const theme = useTheme();
  const [exerciseId, setExerciseId] = useState<ExerciseId | null>(null);
  const [equipment, setEquipment] = useState<Equipment>('free');
  const [setsText, setSetsText] = useState('3');
  const [repsText, setRepsText] = useState('10');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [weighIns, setWeighIns] = useState<{ kg: number; measuredAt: string }[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [logging, setLogging] = useState(false);

  const todayKey = dayKey();

  const reloadDay = useCallback(async () => {
    const [p, w, daySessions] = await Promise.all([getProfile(), getWeighIns(), getWorkoutSessionsForDay(todayKey)]);
    setProfile(p);
    setWeighIns(w);
    setSessions(daySessions);
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

  if (!license) return <Redirect href="/" />;

  const accent = isDark ? Brand.lime : Brand.primaryDeep;
  const cardBg = isDark ? '#131D2D' : '#FFFFFF';
  const hairline = theme.line;
  const picked = hasPickedExercise(exerciseId);
  const exercise = picked ? getExercise(exerciseId) : undefined;
  const listed = picked ? listedMuscles(exerciseId) : [];
  const primary = listed.filter((m) => m.role === 'primary');
  const assisting = listed.filter((m) => m.role === 'assisting');

  const sets = clampSets(Number(setsText));
  const reps = clampReps(Number(repsText));
  const durationSec = picked ? sessionDurationSec(exerciseId, sets, reps) : 0;

  const previewKcal =
    picked && sessionBmr != null ? sessionKcal({ bmr: sessionBmr, exerciseId, sets, reps }) : 0;
  const todayKcal = sessions.reduce((sum, s) => sum + s.kcal, 0);
  const canLog = picked && Boolean(profile) && sets > 0 && reps > 0 && !logging;

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
      });
      await reloadDay();
    } finally {
      setLogging(false);
    }
  }

  async function removeSession(id: number) {
    await deleteWorkoutSession(id);
    await reloadDay();
  }

  function bump(kind: 'sets' | 'reps', delta: number) {
    if (kind === 'sets') setSetsText(String(clampSets((sets || 0) + delta)));
    else setRepsText(String(clampReps((reps || 0) + delta)));
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <EatTrainSwitch
            value="train"
            isDark={isDark}
            onChange={(mode) => {
              if (mode === 'eat') router.replace('/home');
            }}
          />

          {!picked ? (
            <ThemedText type="small" themeColor="textSecondary">
              Pick a workout to see the muscles it uses.
            </ThemedText>
          ) : null}

          <EquipmentSwitch value={equipment} onChange={setEquipment} isDark={isDark} />

          {exercisesGrouped(equipment).map((group) => (
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
                <MuscleFigures exerciseId={exerciseId} isDark={isDark} />
              </View>

              <ThemedText type="smallBold" style={[styles.section, { color: theme.muted }]}>
                Primary
              </ThemedText>
              {primary.map((m) => (
                <View key={m.slug} style={[styles.row, { borderColor: hairline }]}>
                  <ThemedText type="smallBold">{m.name}</ThemedText>
                  <View style={styles.rowMeta}>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.plate}>
                      {m.plate}
                    </ThemedText>
                    <View style={[styles.dot, { backgroundColor: Brand.lime }]} />
                  </View>
                </View>
              ))}

              {assisting.length ? (
                <>
                  <ThemedText type="smallBold" style={[styles.section, { color: theme.muted }]}>
                    Assisting
                  </ThemedText>
                  {assisting.map((m) => (
                    <View key={m.slug} style={[styles.row, { borderColor: hairline }]}>
                      <ThemedText type="smallBold">{m.name}</ThemedText>
                      <View style={styles.rowMeta}>
                        <ThemedText type="small" themeColor="textSecondary" style={styles.plate}>
                          {m.plate}
                        </ThemedText>
                        <View style={[styles.dot, { backgroundColor: '#4A7A22' }]} />
                      </View>
                    </View>
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
                  />
                  <CountStepper
                    label="Reps"
                    value={repsText}
                    onChange={setRepsText}
                    onBump={(d) => bump('reps', d)}
                    accent={accent}
                    theme={theme}
                  />
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
                        ? `${sets} × ${reps} · each rep is ~20s hold · ${formatDurationSec(durationSec)} · from your profile. Add it to raise Eat remaining today.`
                        : `${sets} × ${reps} · ${formatDurationSec(durationSec)} · from your profile (age, sex, height, weight). Add it to raise Eat remaining today.`}
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
              </View>
            </>
          ) : null}

          <ThemedText type="smallBold" style={[styles.section, { color: theme.muted }]}>
            Today · {todayKcal} kcal on Eat remaining
          </ThemedText>
          {sessions.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Nothing logged yet. Stays on this device only.
            </ThemedText>
          ) : (
            sessions.map((session) => (
              <View key={session.id} style={[styles.row, { borderColor: hairline }]}>
                <View style={styles.sessionMeta}>
                  <ThemedText type="smallBold">{getExercise(session.exerciseId)?.name ?? session.exerciseId}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {session.sets} × {session.reps} · {session.kcal} kcal
                  </ThemedText>
                </View>
                <Pressable
                  onPress={() => removeSession(session.id)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${getExercise(session.exerciseId)?.name ?? 'session'}`}
                >
                  <ThemedText type="smallBold" style={{ color: theme.muted }}>
                    Remove
                  </ThemedText>
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
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
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  onBump: (delta: number) => void;
  accent: string;
  theme: { text: string; muted: string; inputBackground: string; lineStrong: string };
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
  kicker: {
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginTop: Spacing.two,
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
  },
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
