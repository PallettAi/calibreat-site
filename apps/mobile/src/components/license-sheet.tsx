import { useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AppMeta, Brand } from '@/constants/app';
import { Fonts, Spacing } from '@/constants/theme';
import { copyText } from '@/lib/clipboard';
import { currentDeviceLabel, type LicenseState } from '@/lib/license';

export function LicenseSheet({
  visible,
  onClose,
  license,
  email,
  onDeactivate,
  isDark,
  accentText,
  hairline,
  textColor,
  mutedColor,
  cardBg,
}: {
  visible: boolean;
  onClose: () => void;
  license: LicenseState;
  email: string;
  onDeactivate: () => void;
  isDark: boolean;
  accentText: string;
  hairline: string;
  textColor: string;
  mutedColor: string;
  cardBg: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const ok = await copyText(license.code);
    setCopied(ok);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.wrap}>
          <Pressable onPress={() => {}} style={[styles.sheet, { backgroundColor: cardBg, borderColor: isDark ? 'rgba(255,255,255,0.12)' : hairline }]}>
            <View style={[styles.handle, { backgroundColor: isDark ? '#FFFFFF' : '#0A1019' }]} />
            <ThemedText type="smallBold" style={[styles.kicker, { color: mutedColor }]}>
              LICENSE
            </ThemedText>
            <View style={styles.row}>
              <ThemedText type="small" themeColor="textSecondary">
                This device
              </ThemedText>
              <Text style={[styles.status, { color: accentText }]}>{currentDeviceLabel()}</Text>
            </View>
            <View style={styles.row}>
              <ThemedText type="small" themeColor="textSecondary">
                Email
              </ThemedText>
              <Text style={[styles.value, { color: textColor }]}>{email}</Text>
            </View>
            <ThemedText type="smallBold" style={[styles.kicker, { color: mutedColor }]}>
              CODE
            </ThemedText>
            <TextInput
              value={license.code}
              editable={false}
              selectTextOnFocus
              style={[styles.code, { color: textColor, borderColor: hairline, backgroundColor: isDark ? '#0C1420' : '#F6F7F4' }]}
            />
            <Pressable onPress={() => void handleCopy()} style={({ pressed }) => [styles.copy, { borderColor: accentText }, pressed && styles.pressed]}>
              <Text style={[styles.copyText, { color: accentText }]}>{copied ? 'Copied' : 'Copy code'}</Text>
            </Pressable>
            <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
              One active device. Deactivate here while online, then unlock on the new phone. If this phone is gone, use “I don’t have that device” on the new one.
            </ThemedText>
            <Pressable
              onPress={() => void Linking.openURL(`mailto:${AppMeta.supportEmail}?subject=${encodeURIComponent('calibrEAT license')}`)}
              style={({ pressed }) => [styles.item, { borderColor: hairline }, pressed && styles.pressed]}
            >
              <ThemedText type="smallBold">Email support</ThemedText>
              <Text style={[styles.chevron, { color: accentText }]}>›</Text>
            </Pressable>
            <Pressable onPress={onDeactivate} style={({ pressed }) => [styles.danger, { borderColor: 'rgba(239,68,68,0.22)' }, pressed && styles.pressed]}>
              <ThemedText type="smallBold" style={{ color: Brand.danger }}>
                Deactivate on this device
              </ThemedText>
            </Pressable>
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
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' },
  status: { fontSize: 13, fontWeight: '800' },
  value: { flex: 1, textAlign: 'right', fontSize: 13, fontWeight: '700' },
  code: { minHeight: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 16, fontWeight: '800', fontFamily: Fonts.rounded, letterSpacing: 1 },
  copy: { minHeight: 44, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  copyText: { fontSize: 13, fontWeight: '800' },
  note: { lineHeight: 18 },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 14, paddingVertical: 14, paddingHorizontal: Spacing.three },
  chevron: { fontSize: 18, fontWeight: '600' },
  danger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 14, paddingVertical: 14 },
  pressed: { opacity: 0.75 },
});
