import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Appearance, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppMeta, Brand } from '@/constants/app';

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Root safety net. A paid app must never show a blank screen: any render throw
 * below this point (a screen, a sheet, a chart) lands on a recoverable card
 * with the state kept, so "Try again" usually restores the session.
 *
 * Deliberately renders without the theme provider or any hook, because the
 * failure may well be underneath those.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // No crash reporter on purpose — the only network call the app makes is
    // licence validation. The console is the record.
    console.error('calibrEAT screen error', error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const dark = Appearance.getColorScheme() === 'dark';
    const bg = dark ? '#0A1019' : '#F6F7F4';
    const card = dark ? '#131D2D' : '#FFFFFF';
    const text = dark ? '#EEF2F5' : '#101820';
    const muted = dark ? '#A7B2BC' : '#46525C';
    const line = dark ? 'rgba(255,255,255,0.09)' : 'rgba(13,21,30,0.09)';

    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.card, { backgroundColor: card, borderColor: line }]}>
            <Text style={[styles.title, { color: text }]}>Something went wrong</Text>
            <Text style={[styles.body, { color: muted }]}>
              Your logs are stored on this device and nothing was lost. Try again — if it keeps
              happening, email {AppMeta.supportEmail} and we&apos;ll sort it.
            </Text>
            <Pressable
              onPress={this.reset}
              accessibilityRole="button"
              accessibilityLabel="Try again"
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}
            >
              <Text style={styles.buttonText}>Try again</Text>
            </Pressable>
            <Text style={[styles.detail, { color: muted }]} numberOfLines={4}>
              {error.message}
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  card: { borderRadius: 22, borderWidth: 1, padding: 24, gap: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 21 },
  button: {
    minHeight: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.primaryDeep,
    marginTop: 4,
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.85 },
  detail: { fontSize: 12, lineHeight: 16, opacity: 0.7 },
});
