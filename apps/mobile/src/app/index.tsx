import { Redirect } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/brand-mark';
import { ExternalLink } from '@/components/external-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppMeta, Brand, LicenseConfig } from '@/constants/app';
import { Fonts, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { isWellFormedCode, normalizeCode } from '@/lib/license';
import { useLicense } from '@/lib/license-context';

const FEATURES = [
  'Log meals, snacks & water in seconds',
  'Scan barcodes from a free food database',
  'Calorie & macro goals that adapt to you',
  'Offline-first — your data stays on your phone',
];

export default function LockScreen() {
  const { activate, license } = useLicense();
  const isDark = useColorScheme() === 'dark';
  const theme = useTheme();

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Activated users never see this screen: route them home immediately.
  if (license) {
    return <Redirect href="/home" />;
  }

  const devMode = __DEV__ && !LicenseConfig.apiBaseUrl.trim();
  const accentSoft = isDark ? 'rgba(31,157,85,0.18)' : '#E3F3E9';
  const accentText = isDark ? Brand.lime : Brand.primaryDeep;

  async function handleActivate() {
    if (busy) return;
    setError(null);
    const normalized = normalizeCode(code);
    if (!isWellFormedCode(normalized)) {
      setError("That code doesn't look complete. Example: AB12-CD34-EF56.");
      return;
    }
    setBusy(true);
    const result = await activate(normalized);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {/* ── Hero ─────────────────────────────────────────────── */}
            <View style={styles.hero}>
              <View style={styles.iconBadge}>
                <Text style={styles.iconBadgeText}>cE</Text>
              </View>
              <BrandMark size={52} />
              <ThemedText themeColor="textSecondary" style={styles.tagline}>
                {AppMeta.tagline}
              </ThemedText>
              <View style={[styles.lockPill, { backgroundColor: accentSoft }]}>
                <Text style={[styles.lockPillDot, { color: accentText }]}>●</Text>
                <ThemedText type="smallBold" style={[styles.lockPillText, { color: accentText }]}>
                  ACTIVATION REQUIRED
                </ThemedText>
              </View>
            </View>

            {/* ── What you get ─────────────────────────────────────── */}
            <View style={styles.features}>
              {FEATURES.map((feature) => (
                <View key={feature} style={styles.featureRow}>
                  <View style={[styles.checkBadge, { backgroundColor: accentSoft }]}>
                    <Text style={[styles.checkMark, { color: accentText }]}>✓</Text>
                  </View>
                  <ThemedText style={styles.featureText}>{feature}</ThemedText>
                </View>
              ))}
            </View>

            {/* ── Activation card ──────────────────────────────────── */}
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">Activate your license</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Enter the lifetime code you received by email after purchasing on the calibrEAT
                website.
              </ThemedText>

              <TextInput
                value={code}
                onChangeText={(text) => {
                  setCode(text);
                  if (error) setError(null);
                }}
                placeholder="AB12-CD34-EF56"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="characters"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
                textContentType="oneTimeCode"
                maxLength={64}
                editable={!busy}
                style={[
                  styles.codeInput,
                  {
                    color: theme.text,
                    backgroundColor: theme.background,
                    borderColor: theme.backgroundSelected,
                  },
                ]}
              />

              {error ? (
                <ThemedText type="small" style={styles.errorText}>
                  {error}
                </ThemedText>
              ) : null}

              <Pressable
                onPress={handleActivate}
                disabled={busy || code.trim().length === 0}
                style={({ pressed }) => [
                  styles.activateButton,
                  { backgroundColor: Brand.primary },
                  (busy || code.trim().length === 0) && styles.buttonDimmed,
                  pressed && styles.buttonPressed,
                ]}>
                {busy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.activateButtonText}>Unlock calibrEAT</Text>
                )}
              </Pressable>

              <View style={styles.orRow}>
                <View style={[styles.orLine, { backgroundColor: theme.backgroundSelected }]} />
                <ThemedText type="small" themeColor="textSecondary">
                  or
                </ThemedText>
                <View style={[styles.orLine, { backgroundColor: theme.backgroundSelected }]} />
              </View>

              <ExternalLink href={LicenseConfig.storeUrl} asChild>
                <Pressable
                  style={({ pressed }) => [
                    styles.storeButton,
                    { borderColor: theme.textSecondary },
                    pressed && styles.buttonPressed,
                  ]}>
                  <ThemedText type="smallBold" style={styles.storeButtonText}>
                    Don't have a code? Get a lifetime license
                  </ThemedText>
                </Pressable>
              </ExternalLink>
            </ThemedView>

            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={styles.finePrint}>
              One-time payment · Instant email delivery · Re-activate on a new phone anytime
            </ThemedText>

            {devMode ? (
              <ThemedText type="code" themeColor="textSecondary" style={styles.devNote}>
                Dev build — no activation server configured, so any well-formed code unlocks
                locally.
              </ThemedText>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.six,
    paddingBottom: Spacing.five,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  iconBadge: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: Brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.three,
  },
  iconBadgeText: {
    color: '#FFFFFF',
    fontFamily: Fonts.rounded,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1,
  },
  tagline: {
    textAlign: 'center',
    marginTop: Spacing.one,
  },
  lockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: 999,
    marginTop: Spacing.three,
  },
  lockPillDot: {
    fontSize: 8,
  },
  lockPillText: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  features: {
    gap: Spacing.three,
    marginTop: Spacing.five,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  checkBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  featureText: {
    flex: 1,
  },
  card: {
    gap: Spacing.three,
    borderRadius: Spacing.four,
    padding: Spacing.four,
    marginTop: Spacing.five,
  },
  codeInput: {
    minHeight: 56,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    fontSize: 18,
    letterSpacing: 2,
    fontFamily: Fonts.mono,
    borderWidth: 1.5,
  },
  errorText: {
    color: Brand.danger,
  },
  activateButton: {
    minHeight: 54,
    borderRadius: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  activateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDimmed: {
    opacity: 0.55,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  orLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  storeButton: {
    minHeight: 52,
    borderRadius: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    paddingHorizontal: Spacing.three,
  },
  storeButtonText: {
    textAlign: 'center',
  },
  finePrint: {
    textAlign: 'center',
    marginTop: Spacing.three,
  },
  devNote: {
    textAlign: 'center',
    marginTop: Spacing.two,
    opacity: 0.8,
  },
});
