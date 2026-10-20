import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type DimensionValue } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand } from '@/constants/app';
import { Spacing } from '@/constants/theme';
import { useKeyboardReveal } from '@/hooks/use-keyboard-reveal';
import { CUP_ML, formatWaterMl, WATER_UNITS, type WaterUnit } from '@/lib/units';

export function WaterSheet({
  visible,
  onClose,
  dayLabel,
  waterMl,
  waterGoal,
  waterUnit,
  waterInput,
  onWaterInput,
  onAdd,
  onQuickAdd,
  adding,
  onUnit,
  editValue,
  onEditValue,
  onSaveTotal,
  onClear,
  savingEdit,
  isDark,
  accentText,
  accentSoft,
  hairline,
  textColor,
  mutedColor,
  cardBg,
}: {
  visible: boolean;
  onClose: () => void;
  dayLabel: string;
  waterMl: number;
  waterGoal: number;
  waterUnit: WaterUnit;
  waterInput: string;
  onWaterInput: (value: string) => void;
  onAdd: () => void;
  onQuickAdd?: (ml: number) => void;
  adding: boolean;
  onUnit: (unit: WaterUnit) => void;
  editValue: string;
  onEditValue: (value: string) => void;
  onSaveTotal: () => void;
  onClear: () => void;
  savingEdit: boolean;
  isDark: boolean;
  accentText: string;
  accentSoft: string;
  hairline: string;
  textColor: string;
  mutedColor: string;
  cardBg: string;
}) {
  // Water is deliberately not the app's green — it is a different quantity, and
  // borrowing the calorie accent would imply it is spent rather than filled.
  const tint = isDark ? '#38BDF8' : '#0284C7';
  const tintSoft = isDark ? 'rgba(56,189,248,0.16)' : 'rgba(2,132,199,0.12)';
  // Home shows water as a fill tube; this is the screen where it is set, and it
  // had the total and the goal as two numbers with nothing drawn between them.
  // Clamped, and a goal of 0 is treated as "no target" rather than dividing.
  const fill = waterGoal > 0 ? Math.max(0, Math.min(1, waterMl / waterGoal)) : 0;
  const fillPct: DimensionValue = `${Math.round(fill * 1000) / 10}%`;
  const quickPresets =
    waterUnit === 'cups'
      ? [
          { label: '+1 cup', ml: CUP_ML },
          { label: '+2 cups', ml: CUP_ML * 2 },
          { label: '+3 cups', ml: CUP_ML * 3 },
        ]
      : [
          { label: '+250 ml', ml: 250 },
          { label: '+500 ml', ml: 500 },
          { label: '+750 ml', ml: 750 },
        ];

  // The sheet is bottom-anchored, so the keyboard would cover its inputs. The
  // wrapper scrolls the focused field above the keyboard and pads the bottom by its height.
  const keyboard = useKeyboardReveal();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <ScrollView
          {...keyboard.scrollProps}
          style={styles.wrap}
          showsVerticalScrollIndicator={false}>
          <Pressable onPress={() => {}} style={[styles.sheet, { backgroundColor: cardBg, borderColor: isDark ? 'rgba(255,255,255,0.12)' : hairline }]}>
            <View style={[styles.handle, { backgroundColor: isDark ? '#FFFFFF' : '#0A1019' }]} />
            <ThemedText type="smallBold" style={[styles.kicker, { color: mutedColor }]}>
              WATER · {dayLabel}
            </ThemedText>
            <Text style={[styles.total, { color: tint }]}>{formatWaterMl(waterMl, waterUnit)}</Text>
            <ThemedText type="small" themeColor="textSecondary">
              of {formatWaterMl(waterGoal, waterUnit)}
            </ThemedText>
            <View style={[styles.tube, { backgroundColor: tintSoft }]}>
              <View style={[styles.tubeFill, { width: fillPct, backgroundColor: tint }]} />
            </View>
            {onQuickAdd ? (
              <View style={styles.presets}>
                {quickPresets.map((preset) => (
                  <Pressable
                    key={preset.label}
                    onPress={() => onQuickAdd(preset.ml)}
                    disabled={adding}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${preset.label}`}
                    style={({ pressed }) => [
                      styles.presetBtn,
                      { borderColor: tint, backgroundColor: tintSoft },
                      adding && styles.dimmed,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.presetText, { color: tint }]}>{preset.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View style={styles.row}>
              <TextInput
                {...keyboard.field('waterAdd')}
                value={waterInput}
                onChangeText={onWaterInput}
                placeholder={waterUnit === 'ml' ? 'Add ml' : 'Add cups'}
                placeholderTextColor={mutedColor}
                keyboardType="numeric"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={onAdd}
                style={[
                  styles.input,
                  {
                    color: textColor,
                    backgroundColor: isDark ? '#0C1420' : '#F6F7F4',
                    borderColor: waterInput.length ? accentText : hairline,
                  },
                ]}
              />
              <Pressable
                onPress={onAdd}
                disabled={adding || waterInput.trim().length === 0}
                style={({ pressed }) => [
                  styles.addBtn,
                  { backgroundColor: tint },
                  (adding || waterInput.trim().length === 0) && styles.dimmed,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.addText}>{adding ? '…' : 'Add'}</Text>
              </Pressable>
            </View>
            <View style={styles.units}>
              {WATER_UNITS.map((unit) => {
                const selected = waterUnit === unit.value;
                return (
                  <Pressable
                    key={unit.value}
                    onPress={() => onUnit(unit.value)}
                    style={({ pressed }) => [
                      styles.unitBtn,
                      { borderColor: hairline },
                      selected && { borderColor: accentText, backgroundColor: accentSoft },
                      pressed && styles.pressed,
                    ]}
                  >
                    <ThemedText type="smallBold" style={selected ? { color: accentText } : undefined}>
                      {unit.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
              <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                1 cup ≈ {CUP_ML} ml
              </ThemedText>
            </View>
            <ThemedText type="smallBold" style={[styles.kicker, { color: mutedColor, marginTop: 8 }]}>
              SET TOTAL
            </ThemedText>
            <View style={styles.row}>
              <TextInput
                {...keyboard.field('waterTotal')}
                value={editValue}
                onChangeText={onEditValue}
                placeholder={waterUnit === 'ml' ? 'Total ml' : 'Total cups'}
                placeholderTextColor={mutedColor}
                keyboardType="numeric"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={onSaveTotal}
                style={[
                  styles.input,
                  {
                    color: textColor,
                    backgroundColor: isDark ? '#0C1420' : '#F6F7F4',
                    borderColor: editValue.length ? accentText : hairline,
                  },
                ]}
              />
              <ThemedText type="small" themeColor="textSecondary" style={styles.suffix}>
                {waterUnit === 'ml' ? 'ml' : 'cups'}
              </ThemedText>
            </View>
            <View style={styles.actions}>
              <Pressable onPress={onClear} disabled={savingEdit} style={({ pressed }) => [styles.ghost, { borderColor: 'rgba(239,68,68,0.28)' }, pressed && styles.pressed]}>
                <Text style={styles.clear}>Clear</Text>
              </Pressable>
              <Pressable
                onPress={onSaveTotal}
                disabled={savingEdit}
                style={({ pressed }) => [styles.save, { backgroundColor: accentText }, pressed && styles.pressed, savingEdit && styles.dimmed]}
              >
                <Text style={[styles.saveText, { color: isDark ? '#0A1019' : '#fff' }]}>{savingEdit ? '…' : 'Save total'}</Text>
              </Pressable>
            </View>
          </Pressable>
          {keyboard.bottomInset > 0 ? <View style={{ height: keyboard.bottomInset }} /> : null}
        </ScrollView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(2,8,16,0.76)', justifyContent: 'flex-end', paddingHorizontal: 14, paddingBottom: 18 },
  // Sized to its content (flexGrow 0) so the backdrop above it still receives taps.
  wrap: { width: '100%', maxWidth: 380, alignSelf: 'center', flexGrow: 0 },
  sheet: { borderRadius: 22, borderWidth: 1, padding: Spacing.three, gap: 10 },
  handle: { width: 36, height: 4, borderRadius: 99, alignSelf: 'center', opacity: 0.22 },
  kicker: { fontSize: 11, letterSpacing: 1.2 },
  total: { fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  tube: { height: 10, borderRadius: 5, overflow: 'hidden' },
  tubeFill: { height: 10, borderRadius: 5 },
  presets: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  presetBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  presetText: { fontSize: 13, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  // flexBasis/minWidth 0 so the field shrinks to the row on web instead of
  // its intrinsic text width pushing the Add button past the sheet padding.
  input: { flex: 1, flexBasis: 0, minWidth: 0, minHeight: 48, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, fontSize: 17, fontWeight: '700' },
  addBtn: { flexShrink: 0, minHeight: 48, minWidth: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  addText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  units: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  unitBtn: { minHeight: 36, minWidth: 56, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  hint: { marginLeft: 4 },
  suffix: { minWidth: 36 },
  actions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', alignItems: 'center' },
  ghost: { borderWidth: 1, borderRadius: 12, minHeight: 44, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  clear: { color: Brand.danger, fontSize: 13, fontWeight: '700' },
  save: { minHeight: 44, borderRadius: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 13, fontWeight: '800' },
  dimmed: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
});
