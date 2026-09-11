import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Brand } from '@/constants/app';

type Mode = 'eat' | 'train';

export function EatTrainSwitch({
  value,
  onChange,
  isDark,
}: {
  value: Mode;
  onChange: (next: Mode) => void;
  isDark: boolean;
}) {
  const on = isDark ? Brand.lime : Brand.primaryDeep;
  const onText = isDark ? '#0A1019' : '#F6F7F4';
  const offText = isDark ? '#7D8A96' : '#67727C';
  const track = isDark ? '#0E1623' : '#FFFFFF';
  const line = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(13, 21, 30, 0.09)';

  return (
    <View style={[styles.track, { backgroundColor: track, borderColor: line }]}>
      <Pressable
        onPress={() => onChange('eat')}
        style={[styles.slot, value === 'eat' && { backgroundColor: on }]}
        accessibilityRole="button"
        accessibilityState={{ selected: value === 'eat' }}
        accessibilityLabel="Eat"
      >
        <Text style={[styles.label, { color: value === 'eat' ? onText : offText }]}>Eat</Text>
      </Pressable>
      <Pressable
        onPress={() => onChange('train')}
        style={[styles.slot, value === 'train' && { backgroundColor: on }]}
        accessibilityRole="button"
        accessibilityState={{ selected: value === 'train' }}
        accessibilityLabel="Train"
      >
        <Text style={[styles.label, { color: value === 'train' ? onText : offText }]}>Train</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  slot: {
    flex: 1,
    borderRadius: 9,
    paddingVertical: 8,
    alignItems: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
});
