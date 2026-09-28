/**
 * Hevy-like athletic body (front + back). Paths come from
 * react-native-body-highlighter (MIT, Hicham ELABBASSI) — we only recolor.
 *
 * Reverse search: tapping a muscle on the figure filters Train's list to the
 * lifts that hit it, via the library's onBodyPartPress.
 */

import { StyleSheet, View } from 'react-native';
import Body, { type ExtendedBodyPart, type BodyPart } from 'react-native-body-highlighter';

import { Brand } from '@/constants/app';
import { allMuscleSlugs, highlightForExercise } from '@/lib/muscles';
import type { MuscleSlug } from '@/lib/muscles';

const PRIMARY = Brand.lime;
const ASSISTING = '#4A7A22';
const REST_DARK = '#3A4654';
const REST_LIGHT = '#3F3F3F';
const BORDER_DARK = 'rgba(255,255,255,0.16)';
const BORDER_LIGHT = 'rgba(13, 21, 30, 0.16)';

const MUSCLE_SLUGS = new Set<string>(allMuscleSlugs());

function isMuscleSlug(value: string): value is MuscleSlug {
  return MUSCLE_SLUGS.has(value);
}

export function MuscleFigures({
  exerciseId,
  isDark,
  onMusclePress,
}: {
  exerciseId: string;
  isDark: boolean;
  /** Tap a muscle region on the figure → filter the exercise list to that muscle. */
  onMusclePress?: (slug: MuscleSlug) => void;
}) {
  const data = highlightForExercise(exerciseId) as ExtendedBodyPart[];
  const rest = isDark ? REST_DARK : REST_LIGHT;
  const border = isDark ? BORDER_DARK : BORDER_LIGHT;

  function handlePartPress(part: BodyPart) {
    const slug = (part as { slug?: string }).slug;
    if (slug && isMuscleSlug(slug) && onMusclePress) onMusclePress(slug);
  }

  return (
    <View style={styles.row} accessibilityLabel="Muscles used — tap a muscle to see lifts for it" accessibilityRole="image">
      <Body
        gender="male"
        side="front"
        scale={0.82}
        data={data}
        colors={[ASSISTING, PRIMARY]}
        defaultFill={rest}
        border={border}
        onBodyPartPress={onMusclePress ? handlePartPress : undefined}
      />
      <Body
        gender="male"
        side="back"
        scale={0.82}
        data={data}
        colors={[ASSISTING, PRIMARY]}
        defaultFill={rest}
        border={border}
        onBodyPartPress={onMusclePress ? handlePartPress : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 4,
  },
});
