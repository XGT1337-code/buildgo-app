import React, { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { AppDataProvider } from '@/context/AppData';
import { FeedbackHost } from '@/components/FeedbackHost';
import colors from '@/constants/colors';
import { AuthProvider, useAppAuth } from '@/lib/auth';
import { RealtimeProvider } from '@/lib/realtime';
import { I18nProvider } from '@/lib/i18n';
import { t } from '@/lib/i18n';
import { BrandLogo } from '@/components/BrandLogo';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Weather and the chat lists go through the query cache; live chat updates arrive over the socket.
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } } });

const c = colors.light;

/** Shown while the saved session is checked, instead of a blank white screen. */
function BootScreen() {
  return (
    <View style={[StyleSheet.absoluteFill, styles.boot]}>
      <BrandLogo width={224} height={66} onDark />
      <ActivityIndicator color={c.accent} style={{ marginTop: 18 }} />
    </View>
  );
}

function AppShell() {
  const { isLoaded } = useAppAuth();
  if (!isLoaded) return <BootScreen />;
  return (
    <>
      <AppDataProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <KeyboardProvider>
            <StatusBar style="dark" />
            {/* On wide web screens keep a phone-width column instead of stretching cards across the monitor. */}
            <View style={styles.page}>
              <View style={styles.column}>
                {/* Changing language remounts everything below; app data above is kept. */}
                <I18nProvider>
                  <RootLayoutNav />
                  <FeedbackHost />
                </I18nProvider>
              </View>
            </View>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </AppDataProvider>
    </>
  );
}

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerBackTitle: t('Back'),
        headerStyle: { backgroundColor: c.background },
        headerTintColor: c.forest,
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: 'Inter_700Bold', fontSize: 17, color: c.foreground },
        contentStyle: { backgroundColor: c.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="field/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="field/edit" options={{ title: t('Site'), presentation: 'modal' }} />
      <Stack.Screen name="log/new" options={{ title: t('Log entry'), presentation: 'modal' }} />
      <Stack.Screen name="listing/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="listing/new" options={{ title: t('Rent out'), presentation: 'modal' }} />
      <Stack.Screen name="find" options={{ title: t('Find equipment'), presentation: 'modal' }} />
      <Stack.Screen name="chat/[id]" options={{ title: '' }} />
      <Stack.Screen name="conditions" options={{ title: t('Conditions') }} />
      <Stack.Screen name="admin" options={{ title: t('Admin panel') }} />
      <Stack.Screen name="documents" options={{ title: t('My documents') }} />
      <Stack.Screen name="vehicle/new" options={{ title: t('Add machine'), presentation: 'modal' }} />
      <Stack.Screen name="profile-edit" options={{ title: t('Edit profile'), presentation: 'modal' }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false, presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError || Platform.OS === 'web') {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError && Platform.OS !== 'web') return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RealtimeProvider>
              <AppShell />
            </RealtimeProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: { backgroundColor: c.forest, alignItems: 'center', justifyContent: 'center' },
  page: { flex: 1, backgroundColor: Platform.OS === 'web' ? c.forest : c.background, alignItems: 'center' },
  column: {
    flex: 1, width: '100%', backgroundColor: c.background, overflow: 'hidden',
    ...(Platform.OS === 'web' ? { maxWidth: 520, boxShadow: '0 0 60px rgba(0,0,0,0.35)' } : {}),
  },
});
