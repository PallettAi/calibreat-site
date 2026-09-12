import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand } from '@/constants/app';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { getIntakeHistory, getGoals, getProfile, getWeighIns, type Goals, type Profile } from '@/lib/db';
import { adaptiveHistory, adaptiveTdee, detectPlateau } from '@/lib/nutrition';
import { getCalorieOverride } from '@/lib/trueburn';
import { useLicense } from '@/lib/license-context';
import { burnTrend, loggingCoverage, movingAverage, slopePerWeek, weighSeries } from '@/lib/trends';

type Series = { t: number; value: number };

export default function TrendsScreen() {
  const { license } = useLicense();
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const theme = useTheme();

  const [loaded, setLoaded] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [weighIns, setWeighIns] = useState<{ kg: number; measuredAt: string }[]>([]);
  const [intakeHistory, setIntakeHistory] = useState<{ dayKey: string; kcal: number }[]>([]);
  const [overrideKcal, setOverrideKcal] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const [p, g, wi, ih, ov] = await Promise.all([
          getProfile(),
          getGoals(),
          getWeighIns(60),
          getIntakeHistory(60),
          getCalorieOverride(),
        ]);
        if (cancelled) return;
        setProfile(p);
        setGoals(g);
        setWeighIns(wi.map((x) => ({ kg: x.kg, measuredAt: x.measuredAt })));
        setIntakeHistory(ih);
        setOverrideKcal(ov);
        setLoaded(true);
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const accentText = isDark ? Brand.lime : Brand.primaryDeep;
  const accent = isDark ? Brand.lime : Brand.primary;

  const estimatedTdee = goals?.tdee ?? 0;
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
    return detectPlateau({
      weighIns: weighIns.map((w) => ({ kg: w.kg, at: w.measuredAt })),
      intakeByDay: intakeHistory,
      adaptive,
    });
  })();

  const burn = burnTrend(burnHistory);
  const weight = weighSeries(weighIns.map((w) => ({ kg: w.kg, at: w.measuredAt })));
  const weightSmoothed = movingAverage(weight, 3);
  const weightSlope = slopePerWeek(weight);
  const coverage = loggingCoverage(intakeHistory);
  const dialTarget = overrideKcal ?? goals?.calorieTarget ?? 2000;

  if (!license) return <Redirect href="/" />;
  if (!loaded) return <ThemedView style={styles.container} />;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
              True Burn trends
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Your measured burn and weight, over time.
            </ThemedText>
          </View>

          {/* ── Burn chart ─────────────────────────────────────── */}
          <View style={[styles.card, { backgroundColor: cardBg(isDark), borderColor: theme.line }]}>
            <View style={styles.cardHead}>
              <ThemedText type="smallBold" style={styles.sectionLabel}>
                MEASURED BURN
              </ThemedText>
              {burn ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {burn.min.toLocaleString()}–{burn.max.toLocaleString()} kcal
                </ThemedText>
              ) : null}
            </View>
            {adaptive?.ready && burnHistory.length >= 2 && burn ? (
              <>
                <TrendChart
                  points={burnHistory.map((p) => ({ t: Date.parse(`${p.dayKey}T00:00:00`), value: p.measuredTdee }))}
                  reference={estimatedTdee}
                  accent={accent}
                  accentText={accentText}
                  track={theme.muted}
                  unit=" kcal"
                />
                <View style={styles.burnStatsRow}>
                  <StatBlock label="Latest" value={burn.latest.toLocaleString()} unit="kcal" accentText={accentText} />
                  <StatBlock label="Average" value={burn.avg.toLocaleString()} unit="kcal" accentText={accentText} />
                  <StatBlock
                    label="Drift"
                    value={burn.driftPerWeek == null ? '—' : `${burn.driftPerWeek > 0 ? '+' : ''}${burn.driftPerWeek.toLocaleString()}`}
                    unit="kcal/wk"
                    accentText={accentText}
                  />
                </View>
                <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                  Each point re-measures your burn from every weigh-in up to that date. One point per weigh-in after the
                  second — more weigh-ins make this steadier.
                </ThemedText>
              </>
            ) : (
              <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                {adaptive?.reason ?? 'Log weigh-ins and daily intake for a week to unlock your measured burn.'}
              </ThemedText>
            )}
          </View>

          {/* ── Plateau banner ─────────────────────────────────── */}
          {plateau?.isPlateau ? (
            <View
              style={[
                styles.plateauWrap,
                {
                  borderColor: 'rgba(239,68,68,0.28)',
                  backgroundColor: isDark ? 'rgba(239,68,68,0.10)' : 'rgba(239,68,68,0.06)',
                },
              ]}
            >
              <Text style={styles.plateauDot}>●</Text>
              <ThemedText type="small" style={{ flex: 1, lineHeight: 17 }}>
                {plateau.message}
              </ThemedText>
            </View>
          ) : null}

          {/* ── Weight chart ───────────────────────────────────── */}
          <View style={[styles.card, { backgroundColor: cardBg(isDark), borderColor: theme.line }]}>
            <View style={styles.cardHead}>
              <ThemedText type="smallBold" style={styles.sectionLabel}>
                WEIGHT
              </ThemedText>
              {weightSlope != null ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {weightSlope > 0 ? '+' : '−'}
                  {Math.abs(weightSlope).toFixed(2)} kg/wk trend
                </ThemedText>
              ) : null}
            </View>
            {weight.length >= 2 ? (
              <>
                <TrendChart points={weightSmoothed} accent={accent} accentText={accentText} track={theme.muted} unit=" kg" />
                <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                  Dots are weigh-ins; the line is a 3-point smoothing so one unusual scale reading can&apos;t drag the
                  trend. The dotted line is the start of the window.
                </ThemedText>
              </>
            ) : (
              <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                {weighIns.length === 0
                  ? 'No weigh-ins yet — log one from Home.'
                  : 'One weigh-in so far — log again after a few days to draw the trend.'}
              </ThemedText>
            )}
          </View>

          {/* ── Coverage ───────────────────────────────────────── */}
          <View style={[styles.card, { backgroundColor: cardBg(isDark), borderColor: theme.line }]}>
            <View style={styles.cardHead}>
              <ThemedText type="smallBold" style={styles.sectionLabel}>
                LOGGING COVERAGE
              </ThemedText>
              {coverage.days > 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {coverage.logged}/{coverage.days} days logged
                </ThemedText>
              ) : null}
            </View>
            {coverage.days > 0 ? (
              <>
                <View style={[styles.coverageTrack, { backgroundColor: trackColor(isDark) }]}>
                  <View
                    style={[
                      styles.coverageFill,
                      {
                        width: `${Math.max(3, Math.round((coverage.logged / coverage.days) * 100))}%`,
                        backgroundColor: accentText,
                      },
                    ]}
                  />
                </View>
                <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                  True Burn averages only the days you log — {coverage.logged === coverage.days ? 'a perfect streak, so the measurement is as sharp as it gets.' : 'more logged days sharpen the measurement.'}
                </ThemedText>
              </>
            ) : (
              <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                Log your first meal to start the coverage count.
              </ThemedText>
            )}
          </View>

          <ThemedText type="small" themeColor="textSecondary" style={styles.footerNote}>
            Your dial is {dialTarget.toLocaleString()} kcal
            {overrideKcal != null ? ' (adopted from True Burn)' : ''}. Adopting a measured target never happens
            automatically — that stays on Home.
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function StatBlock({ label, value, unit, accentText }: { label: string; value: string; unit: string; accentText: string }) {
  return (
    <View style={styles.statBlock}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <Text style={[styles.statValue, { color: accentText }]}>{value}</Text>
      <ThemedText type="small" themeColor="textSecondary">
        {unit}
      </ThemedText>
    </View>
  );
}

function TrendChart({
  points,
  reference,
  accent,
  accentText,
  track,
  unit,
}: {
  points: Series[];
  /** Optional dashed reference line (formula burn, or window start weight). */
  reference?: number;
  accent: string;
  accentText: string;
  track: string;
  unit: string;
}) {
  const w = 300;
  const h = 130;
  const padX = 8;
  const padTop = 10;
  const padBottom = 18;
  const values = points.map((p) => p.value);
  const lo = Math.min(...(reference != null ? [...values, reference] : values));
  const hi = Math.max(...(reference != null ? [...values, reference] : values));
  const span = Math.max(1, hi - lo);
  const xs = points.map((_, i) => padX + (i / Math.max(1, points.length - 1)) * (w - padX * 2));
  const ys = points.map((p) => padTop + (1 - (p.value - lo) / span) * (h - padTop - padBottom));
  const refY = reference != null ? padTop + (1 - (reference - lo) / span) * (h - padTop - padBottom) : null;
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ys[i]!.toFixed(1)}`).join(' ');

  return (
    <View style={styles.chartWrap}>
      <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}>
        <Defs>
          <LinearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={accentText} stopOpacity={0.2} />
            <Stop offset="1" stopColor={accentText} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {refY != null ? <Line x1={padX} y1={refY} x2={w - padX} y2={refY} stroke={track} strokeWidth={1} strokeDasharray="4 4" opacity={0.8} /> : null}
        {path ? <Path d={`${path} L ${xs[xs.length - 1]!.toFixed(1)} ${h - padBottom} L ${xs[0]!.toFixed(1)} ${h - padBottom} Z`} fill="url(#trendFill)" /> : null}
        {path ? <Path d={path} stroke={accent} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {xs.map((x, i) => (
          <Circle key={i} cx={x} cy={ys[i]} r={3} fill={accentText} />
        ))}
      </Svg>
      <View style={styles.chartAxis}>
        <ThemedText type="small" themeColor="textSecondary">
          {fmtAxis(points[0], unit)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {fmtAxis(points[points.length - 1], unit)}
        </ThemedText>
      </View>
    </View>
  );
}

function fmtAxis(p: Series | undefined, unit: string): string {
  if (!p) return '';
  const d = new Date(p.t);
  const label = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  if (unit === ' kg') return `${label} · ${p.value.toFixed(1)} kg`;
  return `${label} · ${Math.round(p.value).toLocaleString()}`;
}

function cardBg(isDark: boolean): string {
  return isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF';
}

function trackColor(isDark: boolean): string {
  return isDark ? 'rgba(255,255,255,0.08)' : 'rgba(13,21,30,0.08)';
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
  card: {
    gap: Spacing.two,
    borderRadius: 22,
    borderWidth: 1,
    padding: Spacing.four,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  sectionLabel: { letterSpacing: 1.2, opacity: 0.75, fontSize: 11 },
  burnStatsRow: { flexDirection: 'row', gap: Spacing.three },
  statBlock: { gap: 1 },
  statValue: { fontSize: 20, fontWeight: '800', fontFamily: Fonts.rounded },
  chartWrap: { gap: 4 },
  chartAxis: { flexDirection: 'row', justifyContent: 'space-between' },
  hint: { lineHeight: 17, fontSize: 12 },
  plateauWrap: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  plateauDot: { color: '#ef4444', fontSize: 9, lineHeight: 17, marginTop: 1 },
  coverageTrack: { height: 6, borderRadius: 99, overflow: 'hidden' },
  coverageFill: { height: '100%', borderRadius: 99 },
  footerNote: { textAlign: 'center', lineHeight: 19, opacity: 0.85, marginTop: Spacing.two },
  pressed: { opacity: 0.7 },
});
