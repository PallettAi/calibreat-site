import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type TourStep = { title: string; body: string };

/** Kept short on purpose: one idea per step, pointing at where things live. */
const STEPS: TourStep[] = [
  {
    title: 'Welcome to calibrEAT',
    body: 'A quick look at where things live. It takes about a minute, and you can replay it any time from Settings.',
  },
  {
    title: 'Log your food',
    body: 'Tap "Log a meal" to add food. You can search, scan a barcode, or reuse a recent meal. Tap any entry later to edit it.',
  },
  {
    title: 'Pick a day',
    body: 'Tap the date at the top to review or log a past day. "Jump to today" brings you back.',
  },
  {
    title: 'Your daily streak',
    body: 'The flame in the top right shows how many days in a row you have logged. Tap it to see your streak and share it.',
  },
  {
    title: 'Track water',
    body: 'The drop in the top right adds water. The bar fills toward your daily goal.',
  },
  {
    title: 'Eat and Train',
    body: 'The Eat / Train switch under the header opens workouts. Log sets and save routines for quick reuse.',
  },
  {
    title: 'The menu',
    body: 'The three lines in the top right hold Settings, Adjust my goals, Nutrients for the selected day, True Burn trends and BMI.',
  },
  {
    title: 'Settings',
    body: 'Settings covers reminders, theme, Health Connect, weigh-in reminders and backups. Replay this tour from there whenever you need a reminder.',
  },
];

type Props = {
  onClose: () => void;
  isDark: boolean;
  accentText: string;
  cardBg: string;
  hairline: string;
};

/**
 * Startup tour. Mount it only while it should be visible: each mount starts at
 * the first step, and unmounting is how it closes.
 */
export function AppTour({ onClose, isDark, accentText, cardBg, hairline }: Props) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;
  const primaryText = isDark ? '#0A1019' : '#FFFFFF';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: hairline }]}>
          <View style={styles.topRow}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.counter}>
              {`${index + 1} OF ${STEPS.length}`}
            </ThemedText>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Skip tour"
              hitSlop={8}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <ThemedText type="smallBold" style={{ color: accentText }}>
                Skip
              </ThemedText>
            </Pressable>
          </View>

          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, { backgroundColor: i === index ? accentText : hairline }]}
              />
            ))}
          </View>

          <ThemedText type="title" style={styles.title}>
            {step.title}
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={styles.body}>
            {step.body}
          </ThemedText>

          <View style={styles.buttons}>
            <Pressable
              onPress={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              accessibilityRole="button"
              accessibilityLabel="Previous step"
              accessibilityState={{ disabled: index === 0 }}
              style={({ pressed }) => [
                styles.button,
                { borderColor: hairline, opacity: index === 0 ? 0.4 : 1 },
                pressed && styles.pressed,
              ]}
            >
              <ThemedText type="smallBold">Back</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => (isLast ? onClose() : setIndex((i) => i + 1))}
              accessibilityRole="button"
              accessibilityLabel={isLast ? 'Finish tour' : 'Next step'}
              style={({ pressed }) => [
                styles.button,
                styles.primaryButton,
                { backgroundColor: accentText, borderColor: accentText },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.primaryText, { color: primaryText }]}>{isLast ? 'Done' : 'Next'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5,10,16,0.6)',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  counter: { letterSpacing: 1.2, fontSize: 11, opacity: 0.8 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { height: 4, flex: 1, borderRadius: 2 },
  title: { fontSize: 22, lineHeight: 28 },
  body: { lineHeight: 22 },
  buttons: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one },
  button: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButton: { flex: 1.4 },
  primaryText: { fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.65 },
});
