/**
 * Hevy-like athletic body (front + back). Paths come from
 * react-native-body-highlighter (MIT, Hicham ELABBASSI) — we only recolor.
 */
import { StyleSheet, View } from 'react-native';
import Body, { type ExtendedBodyPart } from 'react-native-body-highlighter';

import { Brand } from '@/constants/app';
import { highlightForExercise } from '@/lib/muscles';

const PRIMARY = Brand.lime;
const ASSISTING = '#4A7A22';
const REST_DARK = '#3A4654';
const REST_LIGHT = '#3F3F3F';
const BORDER_DARK = 'rgba(255,255,255,0.16)';
const BORDER_LIGHT = 'rgba(13, 21, 30, 0.16)';

export function MuscleFigures({
  exerciseId,
  isDark,
}: {
  exerciseId: string;
  isDark: boolean;
}) {
  const data = highlightForExercise(exerciseId) as ExtendedBodyPart[];
  const rest = isDark ? REST_DARK : REST_LIGHT;
  const border = isDark ? BORDER_DARK : BORDER_LIGHT;

  return (
    <View style={styles.row} accessibilityLabel="Muscles used" accessibilityRole="image">
      <Body
        gender="male"
        side="front"
        scale={0.82}
        data={data}
        colors={[ASSISTING, PRIMARY]}
        defaultFill={rest}
        border={border}
      />
      <Body
        gender="male"
        side="back"
        scale={0.82}
        data={data}
        colors={[ASSISTING, PRIMARY]}
        defaultFill={rest}
        border={border}
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
