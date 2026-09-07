import { StyleSheet, Text } from 'react-native';

import { Brand } from '@/constants/app';
import { Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Props = {
  /** Font size of the wordmark. */
  size?: number;
};

/**
 * The calibrEAT wordmark — "calibr" in the surface text color, "EAT" in a
 * brand green that switches for light/dark contrast.
 */
export function BrandMark({ size = 46 }: Props) {
  const isDark = useColorScheme() === 'dark';
  const base = isDark ? '#FFFFFF' : '#0B1220';
  const accent = isDark ? Brand.lime : Brand.primaryDeep;

  return (
    <Text style={[styles.wordmark, { color: base, fontSize: size, lineHeight: size * 1.1 }]}>
      calibr<Text style={{ color: accent }}>EAT</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  wordmark: {
    fontFamily: Fonts.rounded,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
});
