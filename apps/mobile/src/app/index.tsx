import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
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
import {
  clearVerifiedEmail,
  getVerifiedEmail,
  isWellFormedCode,
  isValidEmail,
  normalizeCode,
  releaseLicense,
  requestEmailVerification,
  verifyEmailCode,
} from '@/lib/license';
import { useLicense } from '@/lib/license-context';

const FEATURES = [
  'Log meals, snacks & water in seconds',
  'Scan barcodes from a free food database',
  'Calorie & macro goals that adapt to you',
  'No customer data collected — signup details stored in a secure third-party database',
];

type Step = 'email' | 'otp' | 'code';

export default function LockScreen() {
  const { activate, license, lockoutMessage } = useLicense();
  const isDark = useColorScheme() === 'dark';
  const theme = useTheme();

  // Signup gate state: email → 6-digit code → license code.
  const [emailLoaded, setEmailLoaded] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('email');

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [slotConflict, setSlotConflict] = useState(false);

  // A returning user who already verified their email skips straight to the
  // license-code step. Nothing renders until the stored state is read, so
  // there's no flash of the wrong step.
  useEffect(() => {
    getVerifiedEmail()
      .then((stored) => {
        setVerifiedEmail(stored);
        setStep(stored ? 'code' : 'email');
      })
      .finally(() => setEmailLoaded(true));
  }, []);

  // Activated users never see this screen: route them home immediately.
  if (license) {
    return <Redirect href="/home" />;
  }
  if (!emailLoaded) {
    return <ThemedView style={styles.container} />;
  }

  const devMode = __DEV__ && !LicenseConfig.apiBaseUrl.trim();
  const accentText = isDark ? Brand.lime : Brand.primaryDeep;
  const checkBadgeBg = isDark ? 'rgba(183,233,60,0.10)' : 'rgba(31,157,85,0.10)';

  function resetErrorInfo() {
    setError(null);
    setInfo(null);
    setSlotConflict(false);
  }

  async function handleRequestCode() {
    if (busy) return;
    resetErrorInfo();
    const clean = email.trim().toLowerCase();
    if (!isValidEmail(clean)) {
      setError('Please enter a valid email address.');
      return;
    }
    setBusy(true);
    const result = await requestEmailVerification(clean);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setInfo(result.message ?? `Verification code sent to ${clean}.`);
    setStep('otp');
  }

  async function handleVerifyOtp() {
    if (busy) return;
    resetErrorInfo();
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter the 6-digit code we sent you.');
      return;
    }
    setBusy(true);
    const result = await verifyEmailCode(email.trim().toLowerCase(), otp);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const verified = email.trim().toLowerCase();
    setVerifiedEmail(verified);
    setEmail(verified);
    setOtp('');
    setStep('code');
  }

  async function handleChangeEmail() {
    if (busy) return;
    resetErrorInfo();
    await clearVerifiedEmail();
    setVerifiedEmail(null);
    setOtp('');
    setStep('email');
  }

  async function handleActivate() {
    if (busy) return;
    resetErrorInfo();
    const normalized = normalizeCode(code);
    if (!isWellFormedCode(normalized)) {
      setError("That code doesn't look complete. Check you pasted the whole key.");
      return;
    }
    setBusy(true);
    const result = await activate(normalized);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      setSlotConflict(result.conflict === 'active_elsewhere');
    }
  }

  async function handleReleaseAndUnlock() {
    if (busy) return;
    resetErrorInfo();
    const normalized = normalizeCode(code);
    if (!isWellFormedCode(normalized)) {
      setError("That code doesn't look complete. Check you pasted the whole key.");
      return;
    }
    setBusy(true);
    const released = await releaseLicense(normalized);
    if (!released.ok) {
      setBusy(false);
      setError(released.message);
      setSlotConflict(true);
      return;
    }
    const result = await activate(normalized);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      setSlotConflict(result.conflict === 'active_elsewhere');
    }
  }

  const cardTitle = step === 'email' ? 'Start with your email' : step === 'otp' ? 'Check your inbox' : 'Activate your license';
  const cardBody =
    step === 'email'
      ? 'Enter the email you used when buying your license. We\'ll send a 6-digit code to prove this device belongs to you.'
      : step === 'otp'
        ? `We sent a 6-digit code to ${email}. Enter it below to verify your email.`
        : 'Enter the lifetime code you received by email after purchasing on the calibrEAT website.';

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
              <BrandMark size={34} />
              <ThemedText themeColor="textSecondary" style={styles.tagline}>
                {AppMeta.tagline}
              </ThemedText>
            </View>

            {/* ── Gate card ───────────────────────────────────────── */}
            <ThemedView
              type="backgroundElement"
              style={[styles.card, { borderColor: theme.line }]}>
              {lockoutMessage ? (
                <View
                  style={[
                    styles.lockoutBanner,
                    { backgroundColor: isDark ? 'rgba(214,69,69,0.14)' : 'rgba(214,69,69,0.10)' },
                  ]}>
                  <Text style={[styles.lockoutTitle, { color: Brand.danger }]}>License locked</Text>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.lockoutBody}>
                    {lockoutMessage}
                  </ThemedText>
                </View>
              ) : null}
              <ThemedText type="smallBold" style={styles.cardTitle}>
                {cardTitle}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {cardBody}
              </ThemedText>

              {step === 'email' ? (
                <TextInput
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (error) setError(null);
                  }}
                  placeholder="you@example.com"
                  placeholderTextColor={theme.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  editable={!busy}
                  style={[
                    styles.textInput,
                    {
                      color: theme.text,
                      backgroundColor: theme.inputBackground,
                      borderColor: theme.lineStrong,
                    },
                  ]}
                />
              ) : null}

              {step === 'otp' ? (
                <TextInput
                  value={otp}
                  onChangeText={(text) => {
                    setOtp(text.replace(/[^0-9]/g, '').slice(0, 6));
                    if (error) setError(null);
                  }}
                  placeholder="••••••"
                  placeholderTextColor={theme.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  maxLength={6}
                  editable={!busy}
                  style={[
                    styles.codeInput,
                    {
                      color: theme.text,
                      backgroundColor: theme.inputBackground,
                      borderColor: theme.lineStrong,
                    },
                  ]}
                />
              ) : null}

              {step === 'code' ? (
                <>
                  <View style={styles.verifiedRow}>
                    <Text style={[styles.verifiedMark, { color: accentText }]}>✓</Text>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.verifiedText}>
                      Verified: {verifiedEmail}
                    </ThemedText>
                    <Pressable
                      onPress={handleChangeEmail}
                      disabled={busy}
                      style={({ pressed }) => [styles.changeLink, pressed && styles.pressed]}>
                      <ThemedText type="smallBold" style={[styles.changeLinkText, { color: accentText }]}>
                        Change
                      </ThemedText>
                    </Pressable>
                  </View>

                  <TextInput
                    value={code}
                    onChangeText={(text) => {
                      setCode(text);
                      if (error) setError(null);
                    }}
                    placeholder="XXXX-XXXX-XXXX"
                    placeholderTextColor={theme.muted}
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
                        backgroundColor: theme.inputBackground,
                        borderColor: theme.lineStrong,
                      },
                    ]}
                  />
                </>
              ) : null}

              {error ? (
                <ThemedText type="small" style={styles.errorText}>
                  {error}
                </ThemedText>
              ) : null}
              {info ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.infoText}>
                  {info}
                </ThemedText>
              ) : null}

              {step === 'email' ? (
                <Pressable
                  onPress={handleRequestCode}
                  disabled={busy || email.trim().length === 0}
                  style={({ pressed }) => [
                    styles.activateButton,
                    { backgroundColor: Brand.primary },
                    (busy || email.trim().length === 0) && styles.buttonDimmed,
                    pressed && styles.buttonPressed,
                  ]}>
                  {busy ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.activateButtonText}>Send verification code</Text>
                  )}
                </Pressable>
              ) : null}

              {step === 'otp' ? (
                <>
                  <Pressable
                    onPress={handleVerifyOtp}
                    disabled={busy || otp.length !== 6}
                    style={({ pressed }) => [
                      styles.activateButton,
                      { backgroundColor: Brand.primary },
                      (busy || otp.length !== 6) && styles.buttonDimmed,
                      pressed && styles.buttonPressed,
                    ]}>
                    {busy ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.activateButtonText}>Verify email</Text>
                    )}
                  </Pressable>
                  <View style={styles.stepLinks}>
                    <Pressable
                      onPress={handleRequestCode}
                      disabled={busy}
                      style={({ pressed }) => [pressed && styles.pressed]}>
                      <ThemedText type="small" themeColor="textSecondary" style={styles.stepLinkText}>
                        Resend code
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={handleChangeEmail}
                      disabled={busy}
                      style={({ pressed }) => [pressed && styles.pressed]}>
                      <ThemedText type="small" themeColor="textSecondary" style={styles.stepLinkText}>
                        Use a different email
                      </ThemedText>
                    </Pressable>
                  </View>
                </>
              ) : null}

              {step === 'code' ? (
                <>
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
                  {slotConflict ? (
                    <Pressable
                      onPress={handleReleaseAndUnlock}
                      disabled={busy}
                      style={({ pressed }) => [
                        styles.releaseButton,
                        { borderColor: theme.lineStrong },
                        busy && styles.buttonDimmed,
                        pressed && styles.buttonPressed,
                      ]}>
                      <ThemedText type="smallBold" style={styles.releaseButtonText}>
                        I don’t have that device
                      </ThemedText>
                    </Pressable>
                  ) : null}
                </>
              ) : null}

              <View style={styles.orRow}>
                <View style={[styles.orLine, { backgroundColor: theme.line }]} />
                <ThemedText type="small" themeColor="textSecondary">
                  or
                </ThemedText>
                <View style={[styles.orLine, { backgroundColor: theme.line }]} />
              </View>

              <ExternalLink href={LicenseConfig.storeUrl} asChild>
                <Pressable
                  style={({ pressed }) => [
                    styles.storeButton,
                    { borderColor: theme.lineStrong },
                    pressed && styles.buttonPressed,
                  ]}>
                  <ThemedText type="smallBold" style={styles.storeButtonText}>
                    Click here to get a license key.
                  </ThemedText>
                </Pressable>
              </ExternalLink>
            </ThemedView>

            {/* ── What you get ─────────────────────────────────────── */}
            <View style={styles.features}>
              {FEATURES.map((feature) => (
                <View key={feature} style={styles.featureRow}>
                  <View style={[styles.checkBadge, { backgroundColor: checkBadgeBg }]}>
                    <Text style={[styles.checkMark, { color: accentText }]}>✓</Text>
                  </View>
                  <ThemedText style={styles.featureText}>{feature}</ThemedText>
                </View>
              ))}
            </View>

            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={styles.finePrint}>
              One-time payment · Instant email delivery · 1 active device. Deactivate on
              this device to move, or email support if that device is gone.
            </ThemedText>

            {devMode ? (
              <ThemedText type="code" themeColor="textSecondary" style={styles.devNote}>
                {step === 'code'
                  ? 'Dev build — no activation server configured, so any well-formed code unlocks locally.'
                  : 'Dev build — no verification server configured, so any 6-digit code verifies locally.'}
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
    paddingTop: Spacing.four,
    paddingBottom: Spacing.five,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  tagline: {
    textAlign: 'center',
    fontSize: 14,
    marginTop: 0,
  },
  card: {
    gap: Spacing.three,
    borderRadius: 22,
    borderWidth: 1,
    padding: Spacing.four,
    marginTop: Spacing.four,
  },
  cardTitle: {
    fontSize: 17,
  },
  lockoutBanner: {
    gap: Spacing.one,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(214,69,69,0.35)',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  lockoutTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  lockoutBody: {
    lineHeight: 19,
  },
  textInput: {
    minHeight: 56,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
    borderWidth: 1,
  },
  codeInput: {
    minHeight: 56,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    fontSize: 17,
    letterSpacing: 2.5,
    fontFamily: Fonts.mono,
    fontWeight: '600',
    textAlign: 'center',
    borderWidth: 1,
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  verifiedMark: {
    fontSize: 13,
    fontWeight: '700',
  },
  verifiedText: {
    flex: 1,
  },
  changeLink: {
    paddingVertical: Spacing.one,
  },
  changeLinkText: {
    textDecorationLine: 'underline',
  },
  pressed: {
    opacity: 0.7,
  },
  errorText: {
    color: Brand.danger,
  },
  infoText: {
    opacity: 0.85,
  },
  activateButton: {
    minHeight: 54,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.25)',
    shadowColor: Brand.primary,
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  activateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  releaseButton: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  releaseButtonText: {
    fontSize: 14,
  },
  buttonDimmed: {
    opacity: 0.55,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  stepLinks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.three,
  },
  stepLinkText: {
    fontWeight: '600',
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
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    paddingHorizontal: Spacing.three,
  },
  storeButtonText: {
    textAlign: 'center',
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
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 0,
  },
  checkMark: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 15,
  },
  featureText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
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