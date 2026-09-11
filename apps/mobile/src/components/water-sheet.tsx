import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand } from '@/constants/app';
import { Spacing } from '@/constants/theme';
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
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.wrap}>
          <Pressable onPress={() => {}} style={[styles.sheet, { backgroundColor: cardBg, borderColor: isDark ? 'rgba(255,255,255,0.12)' : hairline }]}>
            <View style={[styles.handle, { backgroundColor: isDark ? '#FFFFFF' : '#0A1019' }]} />
            <ThemedText type="smallBold" style={[styles.kicker, { color: mutedColor }]}>
              WATER · {dayLabel}
            </ThemedText>
            <Text style={[styles.total, { color: isDark ? '#38BDF8' : '#0284C7' }]}>{formatWaterMl(waterMl, waterUnit)}</Text>
            <ThemedText type="small" themeColor="textSecondary">
              of {formatWaterMl(waterGoal, waterUnit)}
            </ThemedText>
            <View style={styles.row}>
              <TextInput
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
                  { backgroundColor: '#3B82F6' },
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
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(2,8,16,0.76)', justifyContent: 'flex-end', paddingHorizontal: 14, paddingBottom: 18 },
  wrap: { width: '100%', maxWidth: 380, alignSelf: 'center' },
  sheet: { borderRadius: 22, borderWidth: 1, padding: Spacing.three, gap: 10 },
  handle: { width: 36, height: 4, borderRadius: 99, alignSelf: 'center', opacity: 0.22 },
  kicker: { fontSize: 11, letterSpacing: 1.2 },
  total: { fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, fontSize: 17, fontWeight: '700' },
  addBtn: { minHeight: 48, minWidth: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
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
