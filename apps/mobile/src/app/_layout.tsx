import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { LicenseProvider, useLicense } from '@/lib/license-context';
import { armWeighInReminderReschedule, syncWeighInReminder } from '@/lib/weigh-in-notifications';

// Keep the native splash screen up until the stored license has been read and
// re-attested (M5), so returning users never see a flash of the lock screen or
// of unlocked content that the server has since revoked.
SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const colorScheme = useColorScheme();
  const { ready, license } = useLicense();

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  useEffect(() => {
    if (!ready || !license) return;
    armWeighInReminderReschedule();
    void syncWeighInReminder();
  }, [ready, license]);

  if (!ready) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        {/* Lock screen is always registered so a licensed user hitting `/` can
            Redirect to home, and an unlicensed deep-link to a gated screen
            falls back here. */}
        <Stack.Screen name="index" />
        <Stack.Protected guard={!!license}>
          <Stack.Screen name="home" />
          <Stack.Screen name="setup" />
          <Stack.Screen name="macros" />
          <Stack.Screen name="bmi" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="train" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <LicenseProvider>
      <RootNavigator />
    </LicenseProvider>
  );
}
