import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { formatClaimWait, msUntilClaim, streakNeedsClaim, weekPips, type StreakState } from '@/lib/streak';
import {
  DEFAULT_SHARE_FORMAT,
  DEFAULT_SHARE_TEMPLATE,
  SHARE_FORMATS,
  SHARE_FORMAT_IDS,
  SHARE_TEMPLATES,
  SHARE_TEMPLATE_IDS,
  type ShareFormatId,
  type ShareTemplateId,
} from '@/lib/share-templates';

/** Which shape and which look the user picked for their card. */
export type ShareSelection = { format: ShareFormatId; template: ShareTemplateId };

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
  onShare,
  shareLabel,
  sharePreview,
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
  /** Present → the share block (preview + template/format picker) renders. */
  onShare?: (selection: ShareSelection) => void;
  shareLabel?: string;
  /**
   * Renders the card for the current selection so the user sees the exact
   * image before posting. Owned by the screen, which holds the card's data.
   */
  sharePreview?: (selection: ShareSelection) => ReactNode;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [shareFormat, setShareFormat] = useState<ShareFormatId>(DEFAULT_SHARE_FORMAT);
  const [shareTemplate, setShareTemplate] = useState<ShareTemplateId>(DEFAULT_SHARE_TEMPLATE);
  const selection: ShareSelection = { format: shareFormat, template: shareTemplate };
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
            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetInner}
              showsVerticalScrollIndicator={false}
            >
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
            {onShare ? (
              <View style={styles.shareBlock}>
                {sharePreview ? sharePreview(selection) : null}

                <Text style={[styles.pickerLabel, { color: mutedColor }]}>TEMPLATE</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                  style={styles.chipScroll}
                >
                  {SHARE_TEMPLATE_IDS.map((id) => {
                    const on = id === shareTemplate;
                    return (
                      <Pressable
                        key={id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        accessibilityLabel={`${SHARE_TEMPLATES[id].name} card style`}
                        onPress={() => setShareTemplate(id)}
                        style={({ pressed }) => [
                          styles.chip,
                          {
                            borderColor: on ? accentText : hairline,
                            backgroundColor: on
                              ? isDark
                                ? 'rgba(183,233,60,0.14)'
                                : 'rgba(14,107,56,0.10)'
                              : 'transparent',
                          },
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={[styles.chipName, { color: on ? accentText : mutedColor }]}>
                          {SHARE_TEMPLATES[id].name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <Text style={[styles.pickerHint, { color: mutedColor }]}>{SHARE_TEMPLATES[shareTemplate].blurb}</Text>

                <Text style={[styles.pickerLabel, { color: mutedColor }]}>SIZE</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                  style={styles.chipScroll}
                >
                  {SHARE_FORMAT_IDS.map((id) => {
                    const on = id === shareFormat;
                    return (
                      <Pressable
                        key={id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        accessibilityLabel={`${SHARE_FORMATS[id].label} card size`}
                        onPress={() => setShareFormat(id)}
                        style={({ pressed }) => [
                          styles.chip,
                          {
                            borderColor: on ? accentText : hairline,
                            backgroundColor: on
                              ? isDark
                                ? 'rgba(183,233,60,0.14)'
                                : 'rgba(14,107,56,0.10)'
                              : 'transparent',
                          },
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={[styles.chipName, { color: on ? accentText : mutedColor }]}>
                          {SHARE_FORMATS[id].label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <Text style={[styles.pickerHint, { color: mutedColor }]}>{SHARE_FORMATS[shareFormat].hint}</Text>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Share your week as an image"
                  onPress={() => onShare(selection)}
                  disabled={shareLabel === 'Preparing…'}
                  style={({ pressed }) => [
                    styles.shareRow,
                    { borderColor: accentText, backgroundColor: accentText },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.shareGlyph, { color: isDark ? '#0A1019' : '#FFFFFF' }]}>↑</Text>
                  <Text style={[styles.shareRowText, { color: isDark ? '#0A1019' : '#FFFFFF' }]}>
                    {shareLabel ?? 'Share this card'}
                  </Text>
                </Pressable>
              </View>
            ) : null}
            <ThemedText type="small" themeColor="textSecondary" style={styles.quote}>
              Turn up for yourself, everyday.
            </ThemedText>
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
  sheetScroll: { alignSelf: 'stretch', flexGrow: 0 },
  sheetInner: { gap: Spacing.two + 2, alignItems: 'center', paddingBottom: Spacing.one },
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
  shareBlock: { alignSelf: 'stretch', gap: Spacing.one + 2, marginTop: Spacing.two },
  pickerLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginTop: Spacing.one },
  pickerHint: { fontSize: 11, lineHeight: 15 },
  chipScroll: { flexGrow: 0 },
  chipRow: { gap: 6, paddingRight: 4 },
  chip: { borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  chipName: { fontSize: 12, fontWeight: '700' },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 48,
    alignSelf: 'stretch',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.two,
  },
  shareRowText: { fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
  shareGlyph: { fontSize: 14, fontWeight: '800', lineHeight: 16 },
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
