import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type DimensionValue } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BmiArc } from '@/components/bmi-arc';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand } from '@/constants/app';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { getLatestWeighIn, getProfile, getWeighIns, type Profile, type WeighIn } from '@/lib/db';
import { weightPosition, weightWindow, BMI_MAX, BMI_MIN, BMI_TICKS } from '@/lib/bmi-gauge';
import { useLicense } from '@/lib/license-context';
import { bmiBand, bodyMassIndex, healthyWeightRange, resolveBmiWeight } from '@/lib/nutrition';

const BAND_LABEL: Record<string, string> = {
  underweight: 'Underweight',
  healthy: 'Healthy range',
  overweight: 'Overweight',
  obese: 'Obese',
};

/** What the index is worth saying in a sentence, without moralising about it. */
const BAND_NOTE: Record<string, string> = {
  underweight: 'Below the standard band. Worth mentioning to a doctor if it is new.',
  healthy: 'Inside the standard band for your height.',
  overweight: 'Above the standard band. The scale below is the more useful number.',
  obese: 'Well above the standard band. A clinician can put this in context properly.',
};

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Built from the gauge's own constants, so widening the scale or moving a
 *  band edge cannot leave the caption quoting numbers the dial no longer uses. */
const FOOT = `The dial runs ${BMI_MIN} to ${BMI_MAX}, banded at ${BMI_TICKS.join(', ')}. BMI is a coarse index, not a diagnosis — muscle, bone and frame all move the number.`;

export default function BmiScreen() {
  const { license } = useLicense();
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const theme = useTheme();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [weighIns, setWeighIns] = useState<{ kg: number; measuredAt: string }[]>([]);
  const [latest, setLatest] = useState<WeighIn | null>(null);
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const [p, w, latestWeighIn] = await Promise.all([getProfile(), getWeighIns(), getLatestWeighIn()]);
        if (cancelled) return;
        setProfile(p);
        setWeighIns(w);
        setLatest(latestWeighIn);
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
  // The index wants the *latest* weight, and getLatestWeighIn asks for exactly
  // that on both platforms. resolveBmiWeight reads the last element of the list
  // it is given, so handing it the full 60-row history would make the reading
  // depend on which end of that list happened to be populated.
  const resolved = resolveBmiWeight(
    setupKg,
    latest ? [{ kg: latest.kg, at: latest.measuredAt }] : [],
  );
  const bmi = heightCm > 0 ? bodyMassIndex(resolved.kg, heightCm) : null;
  const band = bmi != null ? bmiBand(bmi) : null;
  const range = heightCm > 0 ? healthyWeightRange(heightCm) : null;
  const firstKg = weighIns[0]?.kg ?? null;
  const startBmi = firstKg != null && heightCm > 0 ? bodyMassIndex(firstKg, heightCm) : null;
  const sourceDate = formatWhen(resolved.at);
  // The dial's idle bands and the bar's track are the same neutral, so the one
  // accent on the screen only ever means "this is you".
  const track = theme.lineStrong;
  const window = range ? weightWindow(range.minKg, range.maxKg, resolved.kg) : null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
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
              <BmiArc bmi={bmi} band={band} accent={accent} track={track} />

              <View style={styles.bandRow}>
                <ThemedText type="smallBold" style={[styles.band, band ? { color: accent } : null]}>
                  {band ? BAND_LABEL[band] : '—'}
                </ThemedText>
                {band ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.bandNote}>
                    {BAND_NOTE[band]}
                  </ThemedText>
                ) : null}
              </View>

              <View style={[styles.rule, { backgroundColor: hairline }]} />

              {/* The index is weight rescaled by height, so at a fixed height
                  it is a monotone function of weight and nothing more. This
                  bar is the same reading in units you can act on, which is the
                  whole reason for showing it. */}
              {range && window ? (
                <View style={styles.weightBlock}>
                  <View style={styles.weightHead}>
                    <ThemedText type="smallBold">Where your weight sits</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {resolved.kg} kg
                      {resolved.source === 'weigh-in'
                        ? ` · latest weigh-in${sourceDate ? ` · ${sourceDate}` : ''}`
                        : ' · setup weight'}
                    </ThemedText>
                  </View>
                  <WeightBar kg={resolved.kg} range={range} accent={accent} track={track} />
                  <View style={styles.weightFoot}>
                    <ThemedText type="small" themeColor="textSecondary">
                      {window.minKg} kg
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.weightRangeLabel}>
                      healthy range for {heightCm} cm
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {window.maxKg} kg
                    </ThemedText>
                  </View>
                </View>
              ) : null}

              {startBmi != null && bmi != null && weighIns.length > 0 && startBmi !== bmi ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
                  Start {startBmi} → now {bmi}
                </ThemedText>
              ) : null}
            </View>
          )}

          <ThemedText type="small" themeColor="textSecondary" style={styles.foot}>
            {FOOT}
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/**
 * The same reading as the dial, in kilograms.
 *
 * The healthy range is shaded and the current weight gets a marker, so "am I
 * in range" is a glance rather than a subtraction. A weight outside the window
 * pins to the end of the bar — the window is padded either side of the range
 * precisely so there is somewhere for that to go.
 */
function WeightBar({
  kg,
  range,
  accent,
  track,
}: {
  kg: number;
  range: { minKg: number; maxKg: number };
  accent: string;
  track: string;
}) {
  const window = weightWindow(range.minKg, range.maxKg, kg);
  const at = weightPosition(window, kg);
  const from = weightPosition(window, window.rangeMinKg);
  const to = weightPosition(window, window.rangeMaxKg);
  // DimensionValue is a branded union, so this has to interpolate a number
  // rather than a formatted string — rounding the number is what keeps the
  // rendered percentage from carrying a full float of digits.
  const pct = (value: number): DimensionValue => `${Math.round(value * 100 * 100) / 100}%`;

  return (
    <View style={styles.barStage}>
      <View style={[styles.barTrack, { backgroundColor: track }]}>
        <View
          style={[
            styles.barRange,
            { backgroundColor: accent, left: pct(from), width: pct(Math.max(0, to - from)) },
          ]}
        />
      </View>
      <View
        pointerEvents="none"
        style={[
          styles.barMarker,
          { backgroundColor: accent, borderColor: track, left: pct(at) },
        ]}
      />
    </View>
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
  card: { borderWidth: 1, borderRadius: 22, padding: Spacing.four, gap: 14, alignItems: 'stretch' },
  bandRow: { gap: 3 },
  band: { letterSpacing: 1.1, fontSize: 14, textAlign: 'center' },
  bandNote: { lineHeight: 18, textAlign: 'center' },
  rule: { height: 1, width: '100%' },
  weightBlock: { gap: 9 },
  weightHead: { gap: 2 },
  weightFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  weightRangeLabel: { flexShrink: 1, textAlign: 'center' },
  barStage: { height: 22, justifyContent: 'center' },
  barTrack: { height: 10, borderRadius: 5, overflow: 'hidden' },
  barRange: { position: 'absolute', top: 0, bottom: 0, opacity: 0.3 },
  // Offset by half its own width so `left` is the marker's centre — otherwise
  // a weight at either end hangs off the track.
  barMarker: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    marginLeft: -8,
  },
  body: { lineHeight: 20 },
  cta: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  ctaText: { fontSize: 14, fontWeight: '800' },
  foot: { lineHeight: 19 },
  pressed: { opacity: 0.75 },
});
