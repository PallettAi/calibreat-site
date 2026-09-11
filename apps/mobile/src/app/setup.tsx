import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/brand-mark';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand } from '@/constants/app';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { getProfile, getUnitPrefs, saveProfile, saveUnitPrefs, type Profile } from '@/lib/db';
import {
  ACTIVITY_LEVELS,
  computeGoals,
  GOAL_OPTIONS,
  healthyWeightRange,
  RATE_OPTIONS,
  type ActivityLevel,
  type GoalDirection,
} from '@/lib/nutrition';
import {
  HEIGHT_UNITS,
  heightFromCm,
  heightToCm,
  WEIGHT_UNITS,
  weightFromKg,
  weightToKg,
  type HeightUnit,
  type WeightUnit,
} from '@/lib/units';
import { SUPPLEMENT_OPTIONS } from '@/lib/supplements';
import { useLicense } from '@/lib/license-context';

const TOTAL_STEPS = 8;

type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export default function SetupScreen() {
  const { license } = useLicense();
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const theme = useTheme();

  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<Step>(0);
  const [error, setError] = useState<string | null>(null);

  const [sex, setSex] = useState<'female' | 'male' | null>(null);
  const [age, setAge] = useState('');

  const [heightUnit, setHeightUnit] = useState<HeightUnit>('cm');
  const [heightValue, setHeightValue] = useState('');
  const [heightFeet, setHeightFeet] = useState('');
  const [heightInches, setHeightInches] = useState('');

  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg');
  const [weightValue, setWeightValue] = useState('');
  const [weightStones, setWeightStones] = useState('');

  const [activity, setActivity] = useState<ActivityLevel | null>(null);
  const [goal, setGoal] = useState<GoalDirection | null>(null);
  const [rate, setRate] = useState<0.25 | 0.5>(0.5);
  const [supplements, setSupplements] = useState<string[]>([]);

  // Editing later: prefill from the stored profile (dashboard "Adjust goals"),
  // converting stored metric values into the user's preferred units.
  useEffect(() => {
    (async () => {
      const [profile, prefs] = await Promise.all([getProfile(), getUnitPrefs()]);
      setHeightUnit(prefs.height);
      setWeightUnit(prefs.weight);
      if (profile) {
        setSex(profile.sex);
        setAge(String(profile.ageYears));
        const h = heightFromCm(profile.heightCm, prefs.height);
        setHeightValue(h.value ? String(h.value) : '');
        setHeightFeet(h.feet ? String(h.feet) : '');
        setHeightInches(h.inches ? String(h.inches) : '');
        const w = weightFromKg(profile.weightKg, prefs.weight);
        setWeightValue(w.value ? String(w.value) : String(w.pounds || ''));
        setWeightStones(w.stones ? String(w.stones) : '');
        setActivity(profile.activityLevel);
        setGoal(profile.goal);
        setRate(profile.ratePerWeek === 0.25 ? 0.25 : 0.5);
        setSupplements(profile.supplements ?? []);
      }
      setLoaded(true);
    })();
  }, []);

  const accentText = isDark ? Brand.lime : Brand.primaryDeep;
  const accentBg = isDark ? 'rgba(183,233,60,0.12)' : 'rgba(31,157,85,0.10)';

  const heightCm = heightToCm(Number(heightFeet || 0), Number(heightInches || 0), Number(heightValue || 0), heightUnit);
  const weightKg = weightToKg(Number(weightStones || 0), Number(weightValue || 0), Number(weightValue || 0), weightUnit);

  /** Switch height unit, converting the currently entered value. */
  function changeHeightUnit(unit: HeightUnit) {
    const cm = heightCm;
    if (cm > 0) {
      const h = heightFromCm(cm, unit);
      setHeightValue(h.value ? String(h.value) : '');
      setHeightFeet(h.feet ? String(h.feet) : '');
      setHeightInches(h.inches ? String(h.inches) : '');
    }
    setHeightUnit(unit);
    setError(null);
  }

  /** Switch weight unit, converting the currently entered value. */
  function changeWeightUnit(unit: WeightUnit) {
    const kg = weightKg;
    if (kg > 0) {
      const w = weightFromKg(kg, unit);
      setWeightValue(w.value ? String(w.value) : String(w.pounds || ''));
      setWeightStones(w.stones ? String(w.stones) : '');
    }
    setWeightUnit(unit);
    setError(null);
  }

  function toggleSupplement(id: string) {
    setSupplements((prev) => {
      if (id === 'none') return [];
      const withoutNone = prev.filter((x) => x !== 'none');
      if (withoutNone.includes(id)) return withoutNone.filter((x) => x !== id);
      return [...withoutNone, id];
    });
  }

  const profileShape: Profile | null =
    sex && age && heightCm && weightKg && activity && goal
      ? {
          sex,
          ageYears: Number(age),
          heightCm,
          weightKg,
          activityLevel: activity,
          goal,
          ratePerWeek: rate,
          supplements,
        }
      : null;

  const preview = profileShape ? computeGoals(profileShape) : null;

  function validateStep(): string | null {
    switch (step) {
      case 0:
        return sex ? null : 'Choose your sex to continue.';
      case 1: {
        const n = Number(age);
        return Number.isInteger(n) && n >= 13 && n <= 100 ? null : 'Enter your age in years (13–100).';
      }
      case 2: {
        if (heightUnit === 'ftin') {
          const ft = Number(heightFeet);
          const inches = Number(heightInches || 0);
          if (!Number.isInteger(ft) || ft < 2 || ft > 7) return 'Enter feet between 2 and 7.';
          if (!Number.isInteger(inches) || inches < 0 || inches > 11) return 'Inches must be 0–11.';
          return null;
        }
        const n = Number(heightValue);
        const valid = heightUnit === 'cm' ? n >= 60 && n <= 250 : n >= 0.6 && n <= 2.5;
        return Number.isFinite(n) && valid ? null : heightUnit === 'cm' ? 'Enter your height in cm (60–250).' : 'Enter your height in metres (0.6–2.5).';
      }
      case 3: {
        if (weightUnit === 'st') {
          const st = Number(weightStones);
          const lb = Number(weightValue || 0);
          if (!Number.isInteger(st) || st < 4 || st > 47) return 'Enter stones between 4 and 47.';
          if (!Number.isInteger(lb) || lb < 0 || lb > 13) return 'Pounds must be 0–13.';
          return null;
        }
        const n = Number(weightValue);
        const valid = weightUnit === 'kg' ? n >= 30 && n <= 300 : n >= 66 && n <= 660;
        return Number.isFinite(n) && valid ? null : weightUnit === 'kg' ? 'Enter your weight in kg (30–300).' : 'Enter your weight in lb (66–660).';
      }
      case 4:
        return activity ? null : 'Choose how active you are.';
      case 5:
        return goal ? null : 'Choose a goal to continue.';
      default:
        return null;
    }
  }

  function next() {
    const problem = validateStep();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    if (step < TOTAL_STEPS - 1) {
      setStep((step + 1) as Step);
    } else {
      finish();
    }
  }

  function back() {
    setError(null);
    if (step > 0) {
      setStep((step - 1) as Step);
    } else {
      router.back();
    }
  }

  async function finish() {
    if (!profileShape || saving) return;
    setSaving(true);
    setError(null);
    try {
      await saveProfile(profileShape);
      await saveUnitPrefs({ height: heightUnit, weight: weightUnit, water: 'ml' });
      // Profile recompute resets True Burn calibration — clear any adopted override
      try {
        const { setCalorieOverride, saveTrueBurnState } = await import('@/lib/trueburn');
        await setCalorieOverride(null);
        await saveTrueBurnState({});
      } catch {}
      router.replace('/home');
    } catch {
      setError("Couldn't save your profile. Please try again.");
      setSaving(false);
    }
  }

  if (!license) return <Redirect href="/" />;
  if (!loaded) {
    return <ThemedView style={styles.container} />;
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {/* ── Header ──────────────────────────────────────────── */}
            <View style={styles.header}>
              <BrandMark size={30} />
              <ThemedText type="subtitle" style={styles.title}>
                Set up your profile
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
                Two minutes, and calibrEAT calculates your daily calories & macros. We do not
                store or track ANY of this data.
              </ThemedText>
            </View>

            {/* ── Progress ────────────────────────────────────────── */}
            <View style={styles.progressRow}>
              <ThemedText type="smallBold" style={styles.stepLabel}>
                Step {step + 1} of {TOTAL_STEPS}
              </ThemedText>
              <View style={styles.progressTrack}>
                {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.progressSegment,
                      { backgroundColor: i <= step ? Brand.primary : theme.lineStrong },
                    ]}
                  />
                ))}
              </View>
            </View>

            {/* ── Step content ────────────────────────────────────── */}
            <ThemedView
              type="backgroundElement"
              style={[styles.card, { borderColor: theme.line }]}>
              {step === 0 ? (
                <>
                  <StepHeading title="Which best describes you?" body="Used with your height, weight and age to estimate your daily energy needs." />
                  <ChoiceRow>
                    <ChoiceCard
                      label="Female"
                      detail="Only needed for the BMR formula."
                      selected={sex === 'female'}
                      onPress={() => setSex('female')}
                      accentText={accentText}
                      theme={theme}
                    />
                    <ChoiceCard
                      label="Male"
                      detail="Same — one tap either way."
                      selected={sex === 'male'}
                      onPress={() => setSex('male')}
                      accentText={accentText}
                      theme={theme}
                    />
                  </ChoiceRow>
                </>
              ) : null}

              {step === 1 ? (
                <NumberStep
                  label="How old are you?"
                  body="Your metabolism slows a little with age, so this matters for the estimate."
                  placeholder="Years"
                  value={age}
                  onChange={setAge}
                  suffix="years"
                  theme={theme}
                />
              ) : null}

              {step === 2 ? (
                <>
                  <StepHeading
                    title="How tall are you?"
                    body="Height is used to estimate your body size and a healthy weight range."
                  />
                  <UnitPicker
                    options={HEIGHT_UNITS}
                    value={heightUnit}
                    onChange={changeHeightUnit}
                    accentText={accentText}
                    theme={theme}
                  />
                  {heightUnit === 'ftin' ? (
                    <View style={styles.dualInputRow}>
                      <DualInput
                        label="ft"
                        value={heightFeet}
                        onChange={setHeightFeet}
                        theme={theme}
                      />
                      <DualInput
                        label="in"
                        value={heightInches}
                        onChange={setHeightInches}
                        theme={theme}
                      />
                    </View>
                  ) : (
                    <View style={styles.numberInputRow}>
                      <TextInput
                        value={heightValue}
                        onChangeText={(text) => setHeightValue(text.replace(/[^0-9.]/g, ''))}
                        placeholder={heightUnit === 'cm' ? 'cm' : 'm'}
                        placeholderTextColor={theme.muted}
                        keyboardType="numeric"
                        autoCorrect={false}
                        style={[
                          styles.numberInput,
                          {
                            color: theme.text,
                            backgroundColor: theme.inputBackground,
                            borderColor: theme.lineStrong,
                          },
                        ]}
                      />
                      <ThemedText type="smallBold" style={styles.numberSuffix}>
                        {heightUnit === 'cm' ? 'cm' : 'm'}
                      </ThemedText>
                    </View>
                  )}
                </>
              ) : null}

              {step === 3 ? (
                <>
                  <StepHeading
                    title="What do you weigh today?"
                    body="Your targets adjust automatically as this changes over time."
                  />
                  <UnitPicker
                    options={WEIGHT_UNITS}
                    value={weightUnit}
                    onChange={changeWeightUnit}
                    accentText={accentText}
                    theme={theme}
                  />
                  {weightUnit === 'st' ? (
                    <View style={styles.dualInputRow}>
                      <DualInput
                        label="st"
                        value={weightStones}
                        onChange={setWeightStones}
                        theme={theme}
                      />
                      <DualInput
                        label="lb"
                        value={weightValue}
                        onChange={setWeightValue}
                        theme={theme}
                      />
                    </View>
                  ) : (
                    <View style={styles.numberInputRow}>
                      <TextInput
                        value={weightValue}
                        onChangeText={(text) => setWeightValue(text.replace(/[^0-9.]/g, ''))}
                        placeholder={weightUnit === 'kg' ? 'kg' : 'lb'}
                        placeholderTextColor={theme.muted}
                        keyboardType="numeric"
                        autoCorrect={false}
                        style={[
                          styles.numberInput,
                          {
                            color: theme.text,
                            backgroundColor: theme.inputBackground,
                            borderColor: theme.lineStrong,
                          },
                        ]}
                      />
                      <ThemedText type="smallBold" style={styles.numberSuffix}>
                        {weightUnit === 'kg' ? 'kg' : 'lb'}
                      </ThemedText>
                    </View>
                  )}
                </>
              ) : null}

              {step === 4 ? (
                <>
                  <StepHeading title="How active are you?" body="This scales your baseline up to the calories you actually burn." />
                  <View style={styles.list}>
                    {ACTIVITY_LEVELS.map((level) => (
                      <SelectRow
                        key={level.value}
                        label={level.label}
                        detail={level.detail}
                        selected={activity === level.value}
                        onPress={() => setActivity(level.value)}
                        accentText={accentText}
                        accentBg={accentBg}
                        theme={theme}
                      />
                    ))}
                  </View>
                </>
              ) : null}

              {step === 5 ? (
                <>
                  <StepHeading
                    title="What's your goal?"
                    body={
                      heightCm
                        ? `A healthy range for your height is ${healthyWeightRange(heightCm).minKg}–${healthyWeightRange(heightCm).maxKg} kg — use it as a rough guide.`
                        : 'Your daily calorie target is adjusted up or down from here.'
                    }
                  />
                  <ChoiceRow>
                    {GOAL_OPTIONS.map((option) => (
                      <ChoiceCard
                        key={option.value}
                        label={option.label}
                        detail={option.detail}
                        selected={goal === option.value}
                        onPress={() => setGoal(option.value)}
                        accentText={accentText}
                        theme={theme}
                      />
                    ))}
                  </ChoiceRow>

                  {goal && (goal === 'lose' || goal === 'gain') ? (
                    <View style={styles.rateGroup}>
                      <ThemedText type="smallBold">Pace</ThemedText>
                      <View style={styles.list}>
                        {RATE_OPTIONS.map((option) => (
                          <SelectRow
                            key={option.value}
                            label={option.label}
                            detail={
                              goal === 'lose'
                                ? 'A steady, sustainable deficit'
                                : 'A modest surplus for lean gains'
                            }
                            selected={rate === option.value}
                            onPress={() => setRate(option.value)}
                            accentText={accentText}
                            accentBg={accentBg}
                            theme={theme}
                          />
                        ))}
                      </View>
                    </View>
                  ) : null}

                  {goal === 'monitor' ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      We&apos;ll show your daily calorie total against your estimated maintenance
                      (BMR × activity) — no deficits or targets to hit, just awareness.
                    </ThemedText>
                  ) : null}
                </>
              ) : null}

              {step === 6 ? (
                <>
                  <StepHeading
                    title="Do you take any supplements?"
                    body="Pick any that apply — this helps us tailor hydration hints. Tap again to deselect. Optional — you can skip."
                  />
                  <View style={styles.supplementGrid}>
                    {SUPPLEMENT_OPTIONS.map((opt) => {
                      const isNone = opt.id === 'none';
                      const selected = isNone ? supplements.length === 0 : supplements.includes(opt.id);
                      return (
                        <Pressable
                          key={opt.id}
                          onPress={() => {
                            if (isNone) setSupplements([]);
                            else toggleSupplement(opt.id);
                          }}
                          style={({ pressed }) => [
                            styles.supplementChip,
                            { borderColor: selected ? accentText : theme.lineStrong, backgroundColor: selected ? accentBg : theme.line },
                            pressed && styles.pressed,
                          ]}>
                          <ThemedText type="smallBold" style={selected ? { color: accentText } : undefined}>
                            {opt.label}
                          </ThemedText>
                          <ThemedText type="small" themeColor="textSecondary" style={styles.supplementDetail}>
                            {opt.detail}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                  {supplements.length > 0 ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      Selected: {supplements.map((id) => SUPPLEMENT_OPTIONS.find((o) => o.id === id)?.label ?? id).join(' · ')}
                    </ThemedText>
                  ) : null}
                  {supplements.includes('creatine') ? (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.supplementHint}>
                      Heads up: creatine draws water into muscle — 4 L/day is spot on for most lifters. Keep sipping steadily, not all at once.
                    </ThemedText>
                  ) : null}
                </>
              ) : null}

              {step === 7 ? (
                <>
                  <StepHeading
                    title="Your daily targets"
                    body="Based on your profile, this is what calibrEAT will aim for each day. You can adjust later from the home screen."
                  />
                  {preview ? (
                    <View style={styles.summary}>
                      <View style={styles.summaryCard}>
                        <ThemedText type="small" themeColor="textSecondary">
                          {goal === 'monitor' ? 'Estimated daily burn' : 'Daily calorie target'}
                        </ThemedText>
                        <Text style={[styles.bigNumber, { color: accentText }]}>
                          {preview.calorieTarget.toLocaleString()}
                        </Text>
                        <ThemedText type="small" themeColor="textSecondary">
                          kcal ·{' '}
                          {goal === 'monitor'
                            ? 'monitoring, no adjustment'
                            : goal === 'maintain'
                              ? 'maintenance'
                              : goal === 'lose'
                                ? `${preview.dailyAdjustment * -1} kcal deficit`
                                : `${preview.dailyAdjustment} kcal surplus`}
                        </ThemedText>
                      </View>

                      <View style={styles.macroRow}>
                        <MacroPill label="Protein" grams={preview.proteinG} accentText={accentText} />
                        <MacroPill label="Carbs" grams={preview.carbsG} accentText={accentText} />
                        <MacroPill label="Fat" grams={preview.fatG} accentText={accentText} />
                      </View>

                      <ThemedText type="small" themeColor="textSecondary" style={styles.summaryNote}>
                        Estimated from Mifflin-St Jeor: BMR {preview.bmr.toLocaleString()} kcal ×
                        activity {preview.tdee.toLocaleString()} kcal, then{' '}
                        {goal === 'monitor' || goal === 'maintain'
                          ? 'no adjustment'
                          : 'adjusted for your goal'}.
                      </ThemedText>
                    </View>
                  ) : (
                    <ThemedText type="small" themeColor="textSecondary">
                      Complete the earlier steps to see your targets.
                    </ThemedText>
                  )}
                </>
              ) : null}

              {error ? (
                <ThemedText type="small" style={styles.errorText}>
                  {error}
                </ThemedText>
              ) : null}

              {/* ── Nav buttons ───────────────────────────────────── */}
              <View style={[styles.navRow, step === TOTAL_STEPS - 1 && styles.navRowFinal]}>
                <Pressable
                  onPress={back}
                  disabled={saving}
                  style={({ pressed }) => [
                    styles.navButton,
                    styles.backButton,
                    { borderColor: theme.lineStrong },
                    pressed && styles.pressed,
                  ]}>
                  <ThemedText type="smallBold">{step === 0 ? 'Cancel' : 'Back'}</ThemedText>
                </Pressable>
                <Pressable
                  onPress={next}
                  disabled={saving}
                  style={({ pressed }) => [
                    styles.navButton,
                    styles.primaryButton,
                    step === TOTAL_STEPS - 1 && styles.primaryButtonFinal,
                    { backgroundColor: Brand.primary },
                    pressed && styles.pressed,
                  ]}>
                  {saving ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText} numberOfLines={1}>
                      {step === TOTAL_STEPS - 1 ? 'Save & continue' : 'Continue'}
                    </Text>
                  )}
                </Pressable>
              </View>
            </ThemedView>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

/* ── Small building blocks ─────────────────────────────────────── */

function StepHeading({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.stepHeading}>
      <ThemedText type="smallBold" style={styles.stepTitle}>
        {title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {body}
      </ThemedText>
    </View>
  );
}

function NumberStep({
  label,
  body,
  placeholder,
  value,
  onChange,
  suffix,
  theme,
}: {
  label: string;
  body: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  suffix: string;
  theme: { text: string; inputBackground: string; lineStrong: string; muted: string };
}) {
  return (
    <>
      <StepHeading title={label} body={body} />
      <View style={styles.numberInputRow}>
        <TextInput
          value={value}
          onChangeText={(text) => onChange(text.replace(/[^0-9]/g, ''))}
          placeholder={placeholder}
          placeholderTextColor={theme.muted}
          keyboardType="numeric"
          autoCorrect={false}
          style={[
            styles.numberInput,
            {
              color: theme.text,
              backgroundColor: theme.inputBackground,
              borderColor: theme.lineStrong,
            },
          ]}
        />
        <ThemedText type="smallBold" style={styles.numberSuffix}>
          {suffix}
        </ThemedText>
      </View>
    </>
  );
}

function UnitPicker<T extends string>({
  options,
  value,
  onChange,
  accentText,
  theme,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accentText: string;
  theme: { lineStrong: string; line: string };
}) {
  return (
    <View style={styles.unitPicker}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.unitOption,
              { backgroundColor: theme.line, borderColor: theme.lineStrong },
              selected && { borderColor: accentText, backgroundColor: 'transparent' },
              pressed && styles.pressed,
            ]}>
            <ThemedText type="smallBold" style={selected ? { color: accentText } : undefined}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

function DualInput({
  label,
  value,
  onChange,
  theme,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  theme: { text: string; inputBackground: string; lineStrong: string; muted: string };
}) {
  return (
    <View style={styles.dualInput}>
      <TextInput
        value={value}
        onChangeText={(text) => onChange(text.replace(/[^0-9]/g, ''))}
        placeholder="0"
        placeholderTextColor={theme.muted}
        keyboardType="numeric"
        autoCorrect={false}
        style={[
          styles.numberInput,
          styles.dualInputField,
          {
            color: theme.text,
            backgroundColor: theme.inputBackground,
            borderColor: theme.lineStrong,
          },
        ]}
      />
      <ThemedText type="smallBold" style={styles.numberSuffix}>
        {label}
      </ThemedText>
    </View>
  );
}

function ChoiceRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.choiceRow}>{children}</View>;
}

function ChoiceCard({
  label,
  detail,
  selected,
  onPress,
  accentText,
  theme,
}: {
  label: string;
  detail: string;
  selected: boolean;
  onPress: () => void;
  accentText: string;
  theme: { lineStrong: string; line: string };
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.choiceCard,
        {
          backgroundColor: theme.line,
          borderColor: selected ? accentText : theme.lineStrong,
        },
        pressed && styles.pressed,
      ]}>
      <View style={[styles.radio, { borderColor: selected ? accentText : theme.lineStrong }]}>
        {selected ? <View style={[styles.radioDot, { backgroundColor: accentText }]} /> : null}
      </View>
      <ThemedText type="smallBold">{label}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {detail}
      </ThemedText>
    </Pressable>
  );
}

function SelectRow({
  label,
  detail,
  selected,
  onPress,
  accentText,
  accentBg,
  theme,
}: {
  label: string;
  detail: string;
  selected: boolean;
  onPress: () => void;
  accentText: string;
  accentBg: string;
  theme: { lineStrong: string; line: string };
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.selectRow,
        { backgroundColor: selected ? accentBg : theme.line, borderColor: theme.lineStrong },
        selected && { borderColor: accentText },
        pressed && styles.pressed,
      ]}>
      <View style={styles.selectBody}>
        <ThemedText type="smallBold">{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      </View>
      <View style={[styles.radio, { borderColor: selected ? accentText : theme.lineStrong }]}>
        {selected ? <View style={[styles.radioDot, { backgroundColor: accentText }]} /> : null}
      </View>
    </Pressable>
  );
}

function MacroPill({ label, grams, accentText }: { label: string; grams: number; accentText: string }) {
  return (
    <View style={styles.macroPill}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <Text style={[styles.macroGrams, { color: accentText }]}>{grams}g</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.five,
  },
  header: { alignItems: 'center', gap: Spacing.two },
  title: { fontSize: 26, lineHeight: 34 },
  subtitle: { textAlign: 'center', maxWidth: 420, lineHeight: 20 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.four },
  stepLabel: { width: 110 },
  progressTrack: { flex: 1, flexDirection: 'row', gap: 4 },
  progressSegment: { flex: 1, height: 5, borderRadius: 999 },
  card: {
    gap: Spacing.three,
    borderRadius: 22,
    borderWidth: 1,
    padding: Spacing.four,
    marginTop: Spacing.three,
  },
  stepHeading: { gap: Spacing.one },
  stepTitle: { fontSize: 17 },
  choiceRow: { flexDirection: 'row', gap: Spacing.three, flexWrap: 'wrap' },
  choiceCard: {
    flex: 1,
    minWidth: 140,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  unitPicker: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  unitOption: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberInputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  numberInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    fontSize: 18,
    fontWeight: '600',
    borderWidth: 1,
  },
  numberSuffix: { fontSize: 15, flexShrink: 1 },
  dualInputRow: { flexDirection: 'row', gap: Spacing.two },
  dualInput: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  dualInputField: { flex: 1, minWidth: 0, paddingHorizontal: Spacing.two },
  list: { gap: Spacing.two },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: Spacing.three,
  },
  selectBody: { flex: 1, gap: 2 },
  rateGroup: { gap: Spacing.two },
  summary: { gap: Spacing.three },
  summaryCard: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(31,157,85,0.3)',
    backgroundColor: 'rgba(31,157,85,0.08)',
    paddingVertical: Spacing.four,
    gap: 2,
  },
  bigNumber: { fontSize: 44, fontWeight: '800', letterSpacing: -0.03 },
  macroRow: { flexDirection: 'row', gap: Spacing.two },
  macroPill: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingVertical: Spacing.two + 2,
    gap: 2,
  },
  macroGrams: { fontSize: 17, fontWeight: '700' },
  supplementGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  supplementChip: { minWidth: 140, flexGrow: 1, borderRadius: 14, borderWidth: 1.5, paddingVertical: Spacing.three - 2, paddingHorizontal: Spacing.three, gap: 2 },
  supplementDetail: { lineHeight: 16 },
  supplementHint: { lineHeight: 18, opacity: 0.9 },
  summaryNote: { textAlign: 'center', lineHeight: 19, opacity: 0.85 },
  errorText: { color: Brand.danger },
  navRow: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.two },
  navRowFinal: { flexDirection: 'column-reverse' },
  navButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    paddingHorizontal: Spacing.three,
  },
  backButton: { backgroundColor: 'transparent' },
  primaryButton: { borderWidth: 0 },
  primaryButtonFinal: { width: '100%', flex: 0 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.8 },
});