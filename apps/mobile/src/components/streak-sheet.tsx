import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { formatClaimWait, msUntilClaim, streakNeedsClaim, weekPips, type StreakState } from '@/lib/streak';

export function WeekPips({
  lit,
  color,
  dim,
  size = 7,
}: {
  lit: number;
  color: string;
  dim: string;
  size?: number;
}) {
  const n = Math.max(0, Math.min(7, lit));
  return (
    <View style={styles.pips} accessibilityLabel={`${n} of 7 week days`}>
      {Array.from({ length: 7 }, (_, i) => (
        <View
          key={i}
          style={[
            styles.pip,
            { width: size, height: size, borderRadius: size, backgroundColor: i < n ? color : dim },
          ]}
        />
      ))}
    </View>
  );
}

export function StreakSheet({
  visible,
  onClose,
  onClaim,
  streak,
  isDark,
  accentText,
  hairline,
  mutedColor,
  cardBg,
}: {
  visible: boolean;
  onClose: () => void;
  onClaim: () => void;
  streak: StreakState;
  isDark: boolean;
  accentText: string;
  hairline: string;
  mutedColor: string;
  cardBg: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!visible) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, [visible]);

  const lit = weekPips(streak.current);
  const canClaim = streakNeedsClaim(streak, now);
  const wait = formatClaimWait(msUntilClaim(streak, now));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.wrap}>
          <Pressable onPress={() => {}} style={[styles.sheet, { backgroundColor: cardBg, borderColor: isDark ? 'rgba(255,255,255,0.12)' : hairline }]}>
            <View style={[styles.handle, { backgroundColor: isDark ? '#FFFFFF' : '#0A1019' }]} />
            <ThemedText type="smallBold" style={[styles.kicker, { color: mutedColor }]}>
              STREAK
            </ThemedText>
            <Text style={[styles.day, { color: accentText }]}>Day {streak.current}</Text>
            <WeekPips lit={lit} color={accentText} dim={isDark ? 'rgba(255,255,255,0.14)' : 'rgba(13,21,30,0.12)'} size={9} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.best}>
              Best run: {streak.best} day{streak.best === 1 ? '' : 's'}
            </ThemedText>
            {canClaim ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Claim today's streak"
                onPress={onClaim}
                style={({ pressed }) => [styles.claim, { backgroundColor: accentText }, pressed && styles.pressed]}
              >
                <Text style={[styles.claimText, { color: isDark ? '#0A1019' : '#FFFFFF' }]}>Claim day</Text>
              </Pressable>
            ) : (
              <View style={[styles.wait, { borderColor: hairline }]}>
                <ThemedText type="smallBold" style={{ color: accentText }}>
                  Next claim in {wait}
                </ThemedText>
              </View>
            )}
            <ThemedText type="small" themeColor="textSecondary" style={styles.quote}>
              Turn up for yourself, everyday.
            </ThemedText>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(2,8,16,0.76)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
  },
  wrap: { width: '100%', maxWidth: 380, alignSelf: 'center' },
  sheet: {
    borderRadius: 22,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.two + 2,
    alignItems: 'center',
    shadowOpacity: 0.35,
    shadowRadius: 36,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12,
  },
  handle: { width: 36, height: 4, borderRadius: 99, opacity: 0.22, marginBottom: Spacing.one - 2 },
  kicker: { fontSize: 11, letterSpacing: 1.2, alignSelf: 'flex-start' },
  day: { fontSize: 44, fontWeight: '800', letterSpacing: -1.4, fontFamily: Fonts.rounded, textAlign: 'center' },
  best: { textAlign: 'center' },
  quote: { textAlign: 'center', fontStyle: 'italic', lineHeight: 18, marginTop: Spacing.one },
  pips: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pip: {},
  claim: {
    minHeight: 48,
    minWidth: 180,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.one,
  },
  claimText: { fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
  wait: {
    minHeight: 44,
    minWidth: 180,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.one,
  },
  pressed: { opacity: 0.7 },
});
