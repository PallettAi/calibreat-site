import { Redirect } from 'expo-router';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/brand-mark';
import { ExternalLink } from '@/components/external-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, LicenseConfig } from '@/constants/app';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLicense } from '@/lib/license-context';

const MODULES = [
  {
    icon: '🍽️',
    title: 'Food diary',
    description: 'Log meals and snacks with calories & macros — quick-add included.',
  },
  {
    icon: '📷',
    title: 'Barcode scanner',
    description: 'Scan packaged foods from the free Open Food Facts database.',
  },
  {
    icon: '⚖️',
    title: 'Weight & goals',
    description: 'Set a target, weigh in, and let calibrEAT recalculate your daily needs.',
  },
  {
    icon: '💧',
    title: 'Water tracker',
    description: 'Stay hydrated alongside your meals, all in one timeline.',
  },
  {
    icon: '📊',
    title: 'Insights',
    description: 'Weekly trends for calories, macros and weigh-ins — private, on-device.',
  },
];

export default function HomeScreen() {
  const { license, deactivate } = useLicense();
  const isDark = useColorScheme() === 'dark';

  // Locked users can't reach this screen — route them to the welcome screen.
  if (!license) {
    return <Redirect href="/" />;
  }

  const accentSoft = isDark ? 'rgba(31,157,85,0.18)' : '#E3F3E9';
  const accentText = isDark ? Brand.lime : Brand.primaryDeep;
  const activatedLabel = formatDate(license.activatedAt);

  function confirmDeactivate() {
    const message =
      'Remove the license from this device? You can re-activate anytime with the same code.';
    const doIt = () => {
      void deactivate();
    };
    if (Platform.OS === 'web') {
      const g = globalThis as typeof globalThis & { confirm?: (prompt: string) => boolean };
      if (g.confirm?.(message) ?? true) {
        doIt();
      }
    } else {
      Alert.alert('Deactivate calibrEAT?', message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Deactivate', style: 'destructive', onPress: doIt },
      ]);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          {/* ── Header ────────────────────────────────────────────── */}
          <View style={styles.header}>
            <BrandMark size={30} />
            <View style={[styles.activatedPill, { backgroundColor: accentSoft }]}>
              <Text style={[styles.activatedDot, { color: accentText }]}>●</Text>
              <ThemedText type="smallBold" style={[styles.activatedText, { color: accentText }]}>
                ACTIVATED
              </ThemedText>
            </View>
          </View>

          {/* ── Your license ──────────────────────────────────────── */}
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="subtitle" style={styles.cardTitle}>
              You're all set
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Your lifetime license is active on this device. Everything below is on the way in
              upcoming builds.
            </ThemedText>

            <View style={styles.detailRows}>
              <View style={styles.detailRow}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.detailLabel}>
                  License code
                </ThemedText>
                <Text
                  style={[styles.detailValue, styles.detailCode, { color: accentText }]}>
                  {license.code}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.detailLabel}>
                  Plan
                </ThemedText>
                <ThemedText type="smallBold" style={styles.detailValue}>
                  {license.plan ?? 'Lifetime'}
                </ThemedText>
              </View>
              <View style={styles.detailRow}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.detailLabel}>
                  Activated
                </ThemedText>
                <ThemedText type="smallBold" style={styles.detailValue}>
                  {activatedLabel}
                </ThemedText>
              </View>
            </View>
          </ThemedView>

          {/* ── Roadmap preview ───────────────────────────────────── */}
          <View style={styles.sectionHeader}>
            <ThemedText type="smallBold" style={styles.sectionLabel}>
              ON THE WAY
            </ThemedText>
            <ThemedText type="subtitle">What calibrEAT will do</ThemedText>
          </View>

          <View style={styles.moduleList}>
            {MODULES.map((module) => (
              <ThemedView key={module.title} type="backgroundElement" style={styles.moduleCard}>
                <Text style={styles.moduleIcon}>{module.icon}</Text>
                <View style={styles.moduleBody}>
                  <ThemedText type="smallBold">{module.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {module.description}
                  </ThemedText>
                </View>
              </ThemedView>
            ))}
          </View>

          {/* ── Account / device ──────────────────────────────────── */}
          <View style={styles.footer}>
            <ExternalLink href={LicenseConfig.storeUrl} asChild>
              <Pressable
                style={({ pressed }) => [styles.footerLink, pressed && styles.pressed]}>
                <ThemedText type="linkPrimary">Manage license or buy another</ThemedText>
              </Pressable>
            </ExternalLink>

            <Pressable
              onPress={confirmDeactivate}
              style={({ pressed }) => [styles.footerLink, pressed && styles.pressed]}>
              <ThemedText type="link" style={styles.deactivateText}>
                Deactivate on this device
              </ThemedText>
            </Pressable>

            <ThemedText type="small" themeColor="textSecondary" style={styles.footerNote}>
              calibrEAT has no ads, no subscriptions and no data sharing. Your logs stay on-device
              until you choose to back them up.
            </ThemedText>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
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
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.five,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  activatedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: 999,
  },
  activatedDot: {
    fontSize: 8,
  },
  activatedText: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  card: {
    gap: Spacing.two,
    borderRadius: Spacing.four,
    padding: Spacing.four,
  },
  cardTitle: {
    fontSize: 26,
    lineHeight: 34,
  },
  detailRows: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  detailLabel: {
    flexShrink: 1,
  },
  detailValue: {
    textAlign: 'right',
  },
  detailCode: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  sectionHeader: {
    gap: Spacing.one,
  },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    opacity: 0.7,
  },
  moduleList: {
    gap: Spacing.three,
  },
  moduleCard: {
    flexDirection: 'row',
    gap: Spacing.three,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    alignItems: 'flex-start',
  },
  moduleIcon: {
    fontSize: 22,
    lineHeight: 26,
  },
  moduleBody: {
    flex: 1,
    gap: 2,
  },
  footer: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  footerLink: {
    paddingVertical: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
  deactivateText: {
    color: Brand.danger,
  },
  footerNote: {
    textAlign: 'center',
    marginTop: Spacing.two,
  },
});
