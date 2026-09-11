import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CrispPress } from '@/components/crisp-press';
import { ACTIVE_FIRE, ACTIVE_WATER } from '@/components/glyph-data';
import { FireGlyph, WaterGlyph } from '@/components/glyph-variants';

export function HeaderGlyphButton({
  onPress,
  borderColor,
  backgroundColor,
  label,
  children,
}: {
  onPress: () => void;
  borderColor: string;
  backgroundColor: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <CrispPress
      haptic="select"
      scaleTo={0.94}
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.btnOuter}
      innerStyle={[styles.btn, { borderColor, backgroundColor }]}
    >
      {children}
    </CrispPress>
  );
}

/**
 * Teardrop whose inner fill rises with the day's water percentage.
 * Art is chosen by ACTIVE_WATER in glyph-data; see brand/glyph-gallery.html.
 */
export function WaterDropMark({ fill, color }: { fill: number; color: string }) {
  return <WaterGlyph variant={ACTIVE_WATER} fill={fill} color={color} />;
}

/**
 * Streak flame. The badge only appears when today's run still needs a claim,
 * so a live flame is the only uncluttered "you're good" state.
 * Art is chosen by ACTIVE_FIRE in glyph-data; see brand/glyph-gallery.html.
 */
export function StreakFireMark({ live, count, color }: { live: boolean; count: number; color: string }) {
  return (
    <View style={styles.fireWrap}>
      <FireGlyph variant={ACTIVE_FIRE} live={live} color={color} />
      {!live && count > 0 ? (
        <View style={[styles.countBadge, { borderColor: color, backgroundColor: color }]}>
          <Text style={styles.countText}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  btnOuter: { overflow: 'visible' },
  btn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  fireWrap: { width: 24, height: 26, alignItems: 'center', justifyContent: 'flex-end', overflow: 'visible' },
  countBadge: {
    position: 'absolute',
    right: -7,
    bottom: -4,
    minWidth: 14,
    height: 14,
    paddingHorizontal: 3,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { color: '#FFF7ED', fontSize: 8, fontWeight: '800', lineHeight: 10 },
});
