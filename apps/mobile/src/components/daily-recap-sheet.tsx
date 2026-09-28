import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { DailyShareCardPreview } from '@/components/daily-share-card';
import { SHARE_FORMATS, SHARE_FORMAT_IDS, type ShareFormatId } from '@/lib/share-templates';
import type { DailyCard } from '@/lib/share-daily';

/**
 * The once-a-day recap moment: the app opens, yesterday is closed and summed,
 * and the user gets one clean prompt — look at the day, share it if you want,
 * move on. Shown at most once per day (daily-recap-store.ts), dismissed with a
 * plain "Not now" that never moralizes.
 */
export function DailyRecapSheet({
  visible,
  onClose,
  onShare,
  shareLabel,
  card,
  isDark,
  accentText,
  hairline,
  cardBg,
}: {
  visible: boolean;
  onClose: () => void;
  onShare: (format: ShareFormatId) => void;
  shareLabel?: string;
  card: DailyCard;
  isDark: boolean;
  accentText: string;
  hairline: string;
  cardBg: string;
}) {
  const [format, setFormat] = useState<ShareFormatId>('portrait');
  useEffect(() => {
    if (visible) setFormat('portrait');
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.wrap}>
          <Pressable onPress={() => {}} style={[styles.sheet, { backgroundColor: cardBg, borderColor: isDark ? 'rgba(255,255,255,0.12)' : hairline }]}>
            <View style={[styles.handle, { backgroundColor: isDark ? '#FFFFFF' : '#0A1019' }]} />
            <ScrollView style={styles.scroll} contentContainerStyle={styles.inner} showsVerticalScrollIndicator={false}>
              <ThemedText type="smallBold" style={[styles.kicker, { color: accentText }]}>
                YESTERDAY, CALIBRATED
              </ThemedText>
              <DailyShareCardPreview maxWidth={260} card={card} format={format} />

              <Text style={[styles.pickerLabel, { color: isDark ? 'rgba(238,242,245,0.55)' : 'rgba(13,21,30,0.55)' }]}>SIZE</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={{ flexGrow: 0 }}>
                {SHARE_FORMAT_IDS.map((id) => {
                  const on = id === format;
                  return (
                    <Pressable
                      key={id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`${SHARE_FORMATS[id].label} card size`}
                      onPress={() => setFormat(id)}
                      style={({ pressed }) => [
                        styles.chip,
                        {
                          borderColor: on ? accentText : hairline,
                          backgroundColor: on ? (isDark ? 'rgba(183,233,60,0.14)' : 'rgba(14,107,56,0.10)') : 'transparent',
                        },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: on ? accentText : isDark ? 'rgba(238,242,245,0.7)' : 'rgba(13,21,30,0.7)' }}>
                        {SHARE_FORMATS[id].label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Text style={[styles.pickerHint, { color: isDark ? 'rgba(238,242,245,0.5)' : 'rgba(13,21,30,0.5)' }]}>{SHARE_FORMATS[format].hint}</Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Share yesterday's recap as an image"
                onPress={() => onShare(format)}
                disabled={shareLabel === 'Preparing…'}
                style={({ pressed }) => [styles.shareRow, { backgroundColor: accentText }, pressed && styles.pressed]}
              >
                <Text style={[styles.shareGlyph, { color: isDark ? '#0A1019' : '#FFFFFF' }]}>↑</Text>
                <Text style={[styles.shareRowText, { color: isDark ? '#0A1019' : '#FFFFFF' }]}>{shareLabel ?? 'Share this card'}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Dismiss the daily recap" onPress={onClose} style={({ pressed }) => [styles.later, pressed && styles.pressed]}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: isDark ? 'rgba(238,242,245,0.55)' : 'rgba(13,21,30,0.55)' }}>Not now</Text>
              </Pressable>
            </ScrollView>
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
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    maxHeight: '90%',
    alignItems: 'center',
    shadowOpacity: 0.35,
    shadowRadius: 36,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12,
  },
  scroll: { alignSelf: 'stretch', flexGrow: 0 },
  inner: { gap: Spacing.two, alignItems: 'center', paddingBottom: Spacing.one },
  handle: { width: 36, height: 4, borderRadius: 99, opacity: 0.22, marginBottom: Spacing.one - 2 },
  kicker: { fontSize: 11, letterSpacing: 1.2, alignSelf: 'flex-start' },
  pickerLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginTop: Spacing.one, alignSelf: 'flex-start' },
  pickerHint: { fontSize: 11, lineHeight: 15, alignSelf: 'flex-start' },
  chipRow: { gap: 6, paddingRight: 4 },
  chip: { borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 48,
    alignSelf: 'stretch',
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.two,
  },
  shareRowText: { fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
  shareGlyph: { fontSize: 14, fontWeight: '800', lineHeight: 16 },
  later: { minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.three },
  pressed: { opacity: 0.7 },
});
