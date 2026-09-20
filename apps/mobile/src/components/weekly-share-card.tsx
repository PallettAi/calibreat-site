/**
 * The weekly share card — a branded 1080×1350 (4:5) summary of the user's
 * week, rendered off-screen on the Trends screen and captured to a PNG by
 * share-card.native.ts when the user taps "Share week".
 *
 * Copy rules come from lib/share-card.ts: the card celebrates *behavior*
 * (logging streaks, coverage, the measured True Burn trend) — never bodies.
 * The footer carries the site URL exactly once; that link is the growth loop.
 */

import { StyleSheet, Text, View } from 'react-native';

import { BrandMark } from '@/components/brand-mark';
import { Brand } from '@/constants/app';
import { Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { shareTagline, type ShareCopy } from '@/lib/share-card';

import { WeekPips } from './streak-sheet';

/**
 * Fixed render size. The card is captured with width/height at 3× these
 * values for a crisp 1080×1350 share image regardless of device density.
 */
export const SHARE_CARD_WIDTH = 360;
export const SHARE_CARD_HEIGHT = 450;

export function WeeklyShareCard({ copy, litDays }: { copy: ShareCopy; litDays: number }) {
  const isDark = useColorScheme() === 'dark';
  const bg = isDark ? '#0A1019' : '#F6F7F4';
  const panel = isDark ? '#111A29' : '#FFFFFF';
  const text = isDark ? '#EEF2F5' : '#0A1019';
  const muted = isDark ? '#9FABB7' : '#46525C';
  const accent = isDark ? Brand.lime : Brand.primaryDeep;
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(13,21,30,0.10)';

  return (
    <View style={[styles.card, { backgroundColor: bg, width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT }]}>
      <View style={styles.head}>
        <BrandMark size={26} />
        <Text style={[styles.weekLabel, { color: muted }]}>MY WEEK</Text>
      </View>

      <View style={[styles.panel, { backgroundColor: panel, borderColor: hairline }]}>
        <Text style={[styles.headline, { color: text }]}>{copy.headline}</Text>
        <Text style={[styles.subline, { color: muted }]}>{copy.subline}</Text>
      </View>

      <View style={styles.pipsRow}>
        <WeekPips lit={litDays} color={accent} dim={isDark ? 'rgba(255,255,255,0.14)' : 'rgba(13,21,30,0.12)'} size={10} />
      </View>

      <Text style={[styles.tagline, { color: muted }]}>{shareTagline()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    padding: 26,
    justifyContent: 'space-between',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weekLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    fontFamily: Fonts.rounded,
  },
  panel: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 22,
    gap: 8,
  },
  headline: {
    fontFamily: Fonts.rounded,
    fontWeight: '800',
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  subline: {
    fontSize: 14.5,
    lineHeight: 21,
  },
  pipsRow: {
    alignItems: 'center',
  },
  tagline: {
    fontSize: 12.5,
    textAlign: 'center',
  },
});
