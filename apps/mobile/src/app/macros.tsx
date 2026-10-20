import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand } from '@/constants/app';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { getGoals, getMacrosForDay, getProfile, dayKey, type Goals, type Profile } from '@/lib/db';
import { type DayMacros } from '@/lib/diary';
import { MICRO_DEFS, MICRO_NRV, formatMicroValue, type MicroDef } from '@/lib/micronutrients';
import { getCalorieOverride } from '@/lib/trueburn';

type MacroRow = {
  name: string;
  current: number;
  target: number | null;
  unit: string;
  guidance: string;
  limit?: boolean;
  valueText?: string;
};

export default function MacrosScreen() {
  const router = useRouter();
  const { day } = useLocalSearchParams<{ day?: string | string[] }>();
  const dayParam = Array.isArray(day) ? day[0] : day;
  const macrosDay = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : dayKey();
  const isDark = useColorScheme() === 'dark';
  const theme = useTheme();

  const [loaded, setLoaded] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [overrideKcal, setOverrideKcal] = useState<number | null>(null);
  const [logged, setLogged] = useState<DayMacros>({
    kcal: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    fiberG: 0,
    sugarG: 0,
    satFatG: 0,
    sodiumMg: 0,
    micros: {},
  });

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const [p, g, macros, override] = await Promise.all([
          getProfile(),
          getGoals(),
          getMacrosForDay(macrosDay),
          getCalorieOverride(),
        ]);
        if (cancelled) return;
        setProfile(p);
        setGoals(g);
        setLogged(macros);
        setOverrideKcal(override);
        setLoaded(true);
      })();
      return () => {
        cancelled = true;
      };
    }, [macrosDay]),
  );

  const accentText = isDark ? Brand.lime : Brand.primaryDeep;
  const target = overrideKcal ?? goals?.calorieTarget ?? 2000;
  const isFemale = profile?.sex === 'female';

  const mainMacros: MacroRow[] = [
    { name: 'Protein', current: logged.proteinG, target: goals?.proteinG ?? null, unit: 'g', guidance: '1.8 g per kg of body weight' },
    { name: 'Carbs', current: logged.carbsG, target: goals?.carbsG ?? null, unit: 'g', guidance: 'Remainder of your calorie target' },
    { name: 'Fat', current: logged.fatG, target: goals?.fatG ?? null, unit: 'g', guidance: 'About 25% of calories' },
  ];

  const essentialRows: MacroRow[] = [
    { name: 'Fibre', current: logged.fiberG, target: isFemale ? 25 : 38, unit: 'g', guidance: isFemale ? 'Daily target for women' : 'Daily target for men' },
    { name: 'Sugars', current: logged.sugarG, target: Math.round((target * 0.1) / 4), unit: 'g', guidance: 'Under 10% of calories', limit: true },
    { name: 'Saturated fat', current: logged.satFatG, target: Math.round((target * 0.1) / 9), unit: 'g', guidance: 'Under 10% of calories', limit: true },
    { name: 'Sodium', current: logged.sodiumMg, target: 2300, unit: 'mg', guidance: 'Upper daily limit', limit: true },
  ];

  const microRow = (def: MicroDef): MacroRow => {
    const value = logged.micros[def.key] ?? null;
    const reference = MICRO_NRV[def.key];
    return {
      name: def.label,
      current: value ?? 0,
      target: reference,
      unit: def.unit,
      guidance: value == null ? 'Not reported by the source' : `${Math.round((value / reference) * 100)}% of daily reference`,
      valueText: formatMicroValue(value, def.unit),
    };
  };

  if (!loaded) {
    return <ThemedView style={styles.container} />;
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          {/* ── Header ────────────────────────────────────────────── */}
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={({ pressed }) => [styles.backBtn, { borderColor: theme.line }, pressed && styles.pressed]}
            >
              <Text style={[styles.backChevron, { color: accentText }]}>‹</Text>
              <ThemedText type="smallBold">Back</ThemedText>
            </Pressable>
            <ThemedText type="subtitle" style={styles.title}>
              Macros & nutrients
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              What you logged, against your daily targets.
            </ThemedText>
          </View>

          {/* ── Main macros ───────────────────────────────────────── */}
          <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.line }]}>
            <ThemedText type="smallBold" style={styles.sectionLabel}>
              MACROS
            </ThemedText>
            <View style={styles.columnHead}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.columnHeadText}>
                Logged
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.columnHeadText}>
                Target
              </ThemedText>
            </View>
            {mainMacros.map((row) => (
              <NutrientRow key={row.name} row={row} accentText={accentText} isDark={isDark} theme={theme} />
            ))}
          </ThemedView>

          {/* ── Vitamins & minerals ───────────────────────────────── */}
          <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.line }]}>
            <ThemedText type="smallBold" style={styles.sectionLabel}>
              MICRONUTRIENTS
            </ThemedText>
            <View style={styles.columnHead}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.columnHeadText}>
                Logged
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.columnHeadText}>
                Target
              </ThemedText>
            </View>
            {(['vitamin', 'mineral'] as const).map((group) => (
              <View key={group}>
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.microGroupLabel}>
                  {group === 'vitamin' ? 'Vitamins' : 'Minerals'}
                </ThemedText>
                {MICRO_DEFS.filter((def) => def.group === group).map((def) => (
                  <NutrientRow
                    key={def.key}
                    row={microRow(def)}
                    accentText={accentText}
                    isDark={isDark}
                    theme={theme}
                  />
                ))}
              </View>
            ))}
            <View>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.microGroupLabel}>
                Other essentials
              </ThemedText>
              {essentialRows.map((row) => (
                <NutrientRow key={row.name} row={row} accentText={accentText} isDark={isDark} theme={theme} />
              ))}
            </View>
          </ThemedView>

          <ThemedText type="small" themeColor="textSecondary" style={styles.footerNote}>
            Fibre, sugars, saturated fat and sodium fill from Open Food Facts when the pack lists
            them. Vitamins and minerals come from CoFID or Open Food Facts when the source
            reports them. Blanks mean the source did not say. Percentages use EU daily reference
            values for an average adult, not personal targets.
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function NutrientRow({
  row,
  accentText,
  isDark,
  theme,
}: {
  row: MacroRow;
  accentText: string;
  isDark: boolean;
  theme: { line: string };
}) {
  const targetLabel = row.target === null ? '—' : `${row.limit ? '≤' : '≥'} ${row.target}${row.unit}`;
  const pct = row.target && row.target > 0 ? Math.max(0, Math.min(1, row.current / row.target)) : 0;
  const overLimit = !!row.limit && row.target != null && row.current > row.target;
  const barColor = overLimit ? Brand.danger : accentText;
  const trackColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(13,21,30,0.08)';
  return (
    <View style={[styles.nutrientRow, { borderBottomColor: theme.line }]}>
      <View style={styles.nutrientTop}>
        <View style={styles.nutrientInfo}>
          <ThemedText type="smallBold">{row.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {row.guidance}
          </ThemedText>
        </View>
        <View style={styles.nutrientValues}>
          <Text style={[styles.nutrientCurrent, { color: barColor }]}>
            {row.valueText ?? `${Math.round(row.current)}${row.unit}`}
          </Text>
          <ThemedText type="small" themeColor="textSecondary">
            {targetLabel}
          </ThemedText>
        </View>
      </View>
      {row.target != null && row.target > 0 ? (
        <View style={[styles.progressTrack, { backgroundColor: trackColor }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.round(pct * 100)}%`, backgroundColor: barColor },
            ]}
          />
        </View>
      ) : null}
    </View>
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
    paddingTop: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
  header: { gap: Spacing.two },
  backBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  backChevron: { fontSize: 18, fontWeight: '700', lineHeight: 18 },
  title: { fontSize: 26, lineHeight: 32 },
  columnHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  columnHeadText: { fontSize: 10, letterSpacing: 0.8, opacity: 0.75 },
  pressed: { opacity: 0.7 },
  card: {
    gap: Spacing.two,
    borderRadius: Spacing.four,
    borderWidth: 1,
    padding: Spacing.four,
  },
  sectionLabel: { textTransform: 'uppercase', letterSpacing: 1.2, opacity: 0.85, marginBottom: Spacing.one },
  microGroupLabel: { marginTop: Spacing.two, letterSpacing: 0.8, opacity: 0.85 },
  nutrientRow: {
    gap: 8,
    paddingVertical: Spacing.two + 2,
    borderBottomWidth: 1,
  },
  nutrientTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  nutrientInfo: { flex: 1, gap: 2 },
  nutrientValues: { alignItems: 'flex-end', gap: 2 },
  nutrientCurrent: { fontSize: 15, fontWeight: '700', fontFamily: Fonts.mono },
  progressTrack: {
    height: 5,
    borderRadius: 99,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 99,
  },
  footerNote: { textAlign: 'center', lineHeight: 19, opacity: 0.85, marginTop: Spacing.two },
});