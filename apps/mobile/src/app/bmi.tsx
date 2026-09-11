import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand } from '@/constants/app';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { getProfile, getWeighIns, type Profile } from '@/lib/db';
import { useLicense } from '@/lib/license-context';
import { bmiBand, bodyMassIndex, healthyWeightRange, resolveBmiWeight } from '@/lib/nutrition';

const BAND_LABEL: Record<string, string> = {
  underweight: 'Underweight',
  healthy: 'Healthy range',
  overweight: 'Overweight',
  obese: 'Obese',
};

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function BmiScreen() {
  const { license } = useLicense();
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const theme = useTheme();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [weighIns, setWeighIns] = useState<{ kg: number; measuredAt: string }[]>([]);
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const [p, w] = await Promise.all([getProfile(), getWeighIns()]);
        if (cancelled) return;
        setProfile(p);
        setWeighIns(w);
        setLoaded(true);
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  if (!license) return <Redirect href="/" />;

  const accent = isDark ? Brand.lime : Brand.primaryDeep;
  const cardBg = isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF';
  const hairline = theme.line;
  const heightCm = profile?.heightCm ?? 0;
  const setupKg = profile?.weightKg ?? 0;
  const resolved = resolveBmiWeight(
    setupKg,
    weighIns.map((w) => ({ kg: w.kg, at: w.measuredAt })),
  );
  const bmi = heightCm > 0 ? bodyMassIndex(resolved.kg, heightCm) : null;
  const band = bmi != null ? bmiBand(bmi) : null;
  const range = heightCm > 0 ? healthyWeightRange(heightCm) : null;
  const firstKg = weighIns[0]?.kg ?? null;
  const startBmi = firstKg != null && heightCm > 0 ? bodyMassIndex(firstKg, heightCm) : null;
  const sourceDate = formatWhen(resolved.at);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={({ pressed }) => [styles.backBtn, { borderColor: hairline }, pressed && styles.pressed]}>
            <Text style={[styles.backChevron, { color: accent }]}>‹</Text>
            <ThemedText type="smallBold">Back</ThemedText>
          </Pressable>
          <ThemedText type="smallBold" style={[styles.kicker, { color: theme.muted }]}>
            TOOLS
          </ThemedText>
          <ThemedText type="title" style={styles.title}>
            BMI
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
            Calculated on this device from your height and latest weight. Nothing is sent to calibrEAT.
          </ThemedText>

          {!loaded ? (
            <ThemedText type="small" themeColor="textSecondary">
              Reading the instrument…
            </ThemedText>
          ) : heightCm <= 0 ? (
            <View style={[styles.card, { backgroundColor: cardBg, borderColor: hairline }]}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
                Height is missing, so BMI cannot be calculated. Add it in Adjust my goals.
              </ThemedText>
              <Pressable onPress={() => router.push('/setup')} style={({ pressed }) => [styles.cta, { backgroundColor: accent }, pressed && styles.pressed]}>
                <Text style={[styles.ctaText, { color: isDark ? '#0A1019' : '#fff' }]}>Adjust my goals</Text>
              </Pressable>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: cardBg, borderColor: hairline }]}>
              <Text style={[styles.bmi, { color: accent }]}>{bmi ?? '—'}</Text>
              <ThemedText type="smallBold" style={styles.band}>
                {band ? BAND_LABEL[band] : '—'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
                {resolved.kg} kg
                {resolved.source === 'weigh-in'
                  ? ` · latest weigh-in${sourceDate ? ` · ${sourceDate}` : ''}`
                  : ' · setup weight'}
              </ThemedText>
              {range ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
                  Healthy range for {heightCm} cm: {range.minKg}–{range.maxKg} kg
                </ThemedText>
              ) : null}
              {startBmi != null && bmi != null && weighIns.length > 0 && startBmi !== bmi ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
                  Start {startBmi} → now {bmi}
                </ThemedText>
              ) : null}
            </View>
          )}

          <ThemedText type="small" themeColor="textSecondary" style={styles.foot}>
            BMI is a coarse index, not a diagnosis. Muscle, bone and frame all move the number.
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
  backBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10 },
  backChevron: { fontSize: 22, fontWeight: '600', marginTop: -1 },
  kicker: { fontSize: 11, letterSpacing: 1.4 },
  title: { fontSize: 28, lineHeight: 34 },
  lede: { lineHeight: 20, marginTop: -8 },
  card: { borderWidth: 1, borderRadius: 22, padding: Spacing.four, gap: 8 },
  bmi: { fontSize: 56, fontWeight: '800', letterSpacing: -2, fontFamily: Fonts.rounded },
  band: { letterSpacing: 1.1, fontSize: 13 },
  body: { lineHeight: 20 },
  cta: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  ctaText: { fontSize: 14, fontWeight: '800' },
  foot: { lineHeight: 19 },
  pressed: { opacity: 0.75 },
});
