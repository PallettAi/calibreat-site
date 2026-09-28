/**
 * The BMI dial — the app's instrument treatment applied to the one screen that
 * was still a "card with a big number on it".
 *
 * The arc geometry is not in here: it lives in src/lib/bmi-gauge.ts so it can
 * be checked in CI (scripts/check-bmi-gauge.mjs). This file is only the
 * drawing and the layout, and takes the colours in rather than reaching for
 * the theme itself so it stays as dumb as the rest of the instrument family.
 *
 * On colour, deliberately: the bands are told apart by position and by their
 * tick labels, not by a green-to-red ramp. The app does not moralise about
 * weight, and a dial that reddens as the number climbs says something the
 * product has committed not to say. One accent colour, and it means "you are
 * here" — nothing else on this screen is allowed to be that colour.
 */

import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import {
  bmiAngle,
  bmiSegments,
  bmiTicks,
  type BmiGaugeBandKey,
} from '@/lib/bmi-gauge';

const SIZE = 264;
const STROKE = 18;
const RADIUS = (SIZE - STROKE) / 2;
const MID = SIZE / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const DOT = 9;
/** Unselected bands recede rather than change hue, so the accent stays
 *  meaningful. */
const IDLE_OPACITY = 0.22;

export function BmiArc({
  bmi,
  band,
  accent,
  track,
}: {
  /** Null renders the scale with no marker — the height-is-missing case. */
  bmi: number | null;
  band: BmiGaugeBandKey | null;
  accent: string;
  /** Neutral colour the idle bands and the ticks are drawn in. */
  track: string;
}) {
  const segments = bmiSegments(CIRCUMFERENCE);
  const ticks = bmiTicks();
  const angle = bmi == null ? null : bmiAngle(bmi);
  const radians = ((angle ?? 0) * Math.PI) / 180;
  // Pushed just outside the band stroke so the dot reads as sitting *on* the
  // scale rather than being swallowed by it.
  const dotX = MID + (RADIUS + STROKE / 2) * Math.cos(radians);
  const dotY = MID + (RADIUS + STROKE / 2) * Math.sin(radians);
  const tickInner = RADIUS - STROKE / 2 - 3;
  const tickOuter = RADIUS - STROKE / 2 - 11;

  return (
    <View style={styles.stage} accessibilityElementsHidden>
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {segments.map((segment) => {
          const current = segment.key === band;
          return (
            <Circle
              key={segment.key}
              cx={MID}
              cy={MID}
              r={RADIUS}
              stroke={current ? accent : track}
              strokeWidth={STROKE}
              fill="none"
              // Butt caps, so the four bands meet flush. Round caps would
              // bulge over each other and the boundaries would read as
              // missing.
              strokeLinecap="butt"
              strokeDasharray={`${segment.length} ${CIRCUMFERENCE}`}
              transform={`rotate(${segment.rotate} ${MID} ${MID})`}
              opacity={current ? 1 : IDLE_OPACITY}
            />
          );
        })}

        {/* Unlabelled, like the divisions on a dial face. The numbers live in
            the screen's prose rather than on the arc, where three more glyphs
            would crowd the reading in the middle. */}
        {ticks.map((tick) => {
          const rad = (tick.rotate * Math.PI) / 180;
          return (
            <Line
              key={tick.bmi}
              x1={MID + tickInner * Math.cos(rad)}
              y1={MID + tickInner * Math.sin(rad)}
              x2={MID + tickOuter * Math.cos(rad)}
              y2={MID + tickOuter * Math.sin(rad)}
              stroke={track}
              strokeWidth={2}
              strokeLinecap="round"
            />
          );
        })}

        {band != null && (
          <Circle cx={dotX} cy={dotY} r={DOT} fill={accent} stroke={track} strokeWidth={2} />
        )}
      </Svg>

      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.kicker}>
          BMI
        </ThemedText>
        <ThemedText style={[styles.value, { color: bmi == null ? track : accent }]}>
          {bmi ?? '—'}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 11, letterSpacing: 2.4, marginBottom: -2 },
  value: { fontSize: 62, lineHeight: 68, fontWeight: '800', letterSpacing: -2.5, fontFamily: Fonts.rounded },
});
