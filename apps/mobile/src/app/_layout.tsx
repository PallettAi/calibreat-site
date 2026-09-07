import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { LicenseProvider, useLicense } from '@/lib/license-context';

// Keep the native splash screen up until the stored license has been read, so
// returning (activated) users never see a flash of the lock screen.
SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const colorScheme = useColorScheme();
  const { ready } = useLicense();

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        {/* Locked (no license)  -> index (welcome + activation) */}
        {/* Unlocked (license)  -> home */}
        <Stack.Screen name="index" />
        <Stack.Screen name="home" />
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
