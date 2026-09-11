import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
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
import { useLicense } from '@/lib/license-context';

type MacroRow = {
  name: string;
  current: number;
  target: number | null;
  unit: string;
  guidance: string;
  limit?: boolean;
};

export default function MacrosScreen() {
  const { license } = useLicense();
  const router = useRouter();
  const { day } = useLocalSearchParams<{ day?: string | string[] }>();
  const dayParam = Array.isArray(day) ? day[0] : day;
  const macrosDay = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : dayKey();
  const isDark = useColorScheme() === 'dark';
  const theme = useTheme();

  const [loaded, setLoaded] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [logged, setLogged] = useState<DayMacros>({
    kcal: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    fiberG: 0,
    sugarG: 0,
    satFatG: 0,
    sodiumMg: 0,
  });

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const [p, g, macros] = await Promise.all([getProfile(), getGoals(), getMacrosForDay(macrosDay)]);
        if (cancelled) return;
        setProfile(p);
        setGoals(g);
        setLogged(macros);
        setLoaded(true);
      })();
      return () => {
        cancelled = true;
      };
    }, [macrosDay]),
  );

  const accentText = isDark ? Brand.lime : Brand.primaryDeep;
  const target = goals?.calorieTarget ?? 2000;
  const isFemale = profile?.sex === 'female';

  const mainMacros: MacroRow[] = [
    { name: 'Protein', current: logged.proteinG, target: goals?.proteinG ?? null, unit: 'g', guidance: '1.8 g per kg of body weight' },
    { name: 'Carbs', current: logged.carbsG, target: goals?.carbsG ?? null, unit: 'g', guidance: 'Remainder of your calorie target' },
    { name: 'Fat', current: logged.fatG, target: goals?.fatG ?? null, unit: 'g', guidance: 'About 25% of calories' },
  ];

  const basicMicros: MacroRow[] = [
    { name: 'Fibre', current: logged.fiberG, target: isFemale ? 25 : 38, unit: 'g', guidance: isFemale ? 'Daily target for women' : 'Daily target for men' },
    { name: 'Sugars', current: logged.sugarG, target: Math.round((target * 0.1) / 4), unit: 'g', guidance: 'Under 10% of calories', limit: true },
    { name: 'Saturated fat', current: logged.satFatG, target: Math.round((target * 0.1) / 9), unit: 'g', guidance: 'Under 10% of calories', limit: true },
    { name: 'Sodium', current: logged.sodiumMg, target: 2300, unit: 'mg', guidance: 'Upper daily limit', limit: true },
  ];

  if (!license) return <Redirect href="/" />;
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
            <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
              <ThemedText type="smallBold" style={{ color: accentText }}>
                ‹ Back
              </ThemedText>
            </Pressable>
            <View style={styles.headerTitle}>
              <ThemedText type="subtitle" style={styles.title}>
                Macros & nutrients
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Daily targets, based on your profile.
              </ThemedText>
            </View>
          </View>

          {/* ── Main macros ───────────────────────────────────────── */}
          <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.line }]}>
            <ThemedText type="smallBold" style={styles.sectionLabel}>
              MACROS
            </ThemedText>
            {mainMacros.map((row) => (
              <NutrientRow key={row.name} row={row} accentText={accentText} theme={theme} />
            ))}
          </ThemedView>

          <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.line }]}>
            <ThemedText type="smallBold" style={styles.sectionLabel}>
              BASIC MICRONUTRIENTS
            </ThemedText>
            {basicMicros.map((row) => (
              <NutrientRow key={row.name} row={row} accentText={accentText} theme={theme} />
            ))}
          </ThemedView>

          <ThemedText type="small" themeColor="textSecondary" style={styles.footerNote}>
            Fibre, sugars, saturated fat and sodium fill from Open Food Facts when the pack lists
            them. Manual quick-adds and missing labels stay blank. This is not a full vitamin panel.
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function NutrientRow({
  row,
  accentText,
  theme,
}: {
  row: MacroRow;
  accentText: string;
  theme: { line: string };
}) {
  const targetLabel = row.target === null ? '—' : `${row.limit ? '≤' : '≥'} ${row.target}${row.unit}`;
  return (
    <View style={[styles.nutrientRow, { borderBottomColor: theme.line }]}>
      <View style={styles.nutrientInfo}>
        <ThemedText type="smallBold">{row.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {row.guidance}
        </ThemedText>
      </View>
      <View style={styles.nutrientValues}>
        <Text style={[styles.nutrientCurrent, { color: accentText }]}>
          {Math.round(row.current)}{row.unit}
        </Text>
        <ThemedText type="small" themeColor="textSecondary">
          {targetLabel}
        </ThemedText>
      </View>
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
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  backButton: { paddingVertical: Spacing.one + 2, paddingRight: Spacing.two },
  headerTitle: { flex: 1, gap: 2 },
  title: { fontSize: 26, lineHeight: 34 },
  card: {
    gap: Spacing.two,
    borderRadius: Spacing.four,
    borderWidth: 1,
    padding: Spacing.four,
  },
  sectionLabel: { textTransform: 'uppercase', letterSpacing: 1.2, opacity: 0.85, marginBottom: Spacing.one },
  nutrientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderBottomWidth: 1,
  },
  nutrientInfo: { flex: 1, gap: 2 },
  nutrientValues: { alignItems: 'flex-end', gap: 2 },
  nutrientCurrent: { fontSize: 15, fontWeight: '700', fontFamily: Fonts.mono },
  footerNote: { textAlign: 'center', lineHeight: 19, opacity: 0.85, marginTop: Spacing.two },
  pressed: { opacity: 0.7 },
});