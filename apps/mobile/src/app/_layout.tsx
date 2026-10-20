import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { ErrorBoundary } from '@/components/error-boundary';
import { probeOpenFoodFactsAtLaunch } from '@/lib/barcode';
import { armDailyReminderReschedule, syncDailyReminder } from '@/lib/daily-reminder-notifications';
import { applyThemeMode, getSettings } from '@/lib/settings';
import { silenceWebSvgWarnings } from '@/lib/web-log-filter';
import { armWeighInReminderReschedule, syncWeighInReminder } from '@/lib/weigh-in-notifications';

// See src/lib/web-log-filter.ts — drops react-native-svg's web-only responder
// prop warnings so the dev LogBox banner doesn't cover the Train figure.
silenceWebSvgWarnings();

function RootNavigator() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    armWeighInReminderReschedule();
    void syncWeighInReminder();
    // The Settings switch only becomes real once something schedules from it.
    armDailyReminderReschedule();
    void syncDailyReminder();
    // Once per launch: decides whether name search includes Open Food Facts for this run.
    void probeOpenFoodFactsAtLaunch();
    // Restore the saved light/dark choice before the first screen settles.
    void getSettings().then((s) => applyThemeMode(s.themeMode));
  }, []);

  // One `Stack.Screen` per line, never two on a line: a shared line leaves a
  // whitespace text node between them.
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="home" />
        <Stack.Screen name="setup" />
        <Stack.Screen name="macros" />
        <Stack.Screen name="bmi" />
        <Stack.Screen name="trends" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="train" />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  // The boundary sits OUTSIDE the navigator on purpose: it has to catch a throw
  // from RootNavigator's own render, not just from the screens below it.
  return (
    <ErrorBoundary>
      <RootNavigator />
    </ErrorBoundary>
  );
}
