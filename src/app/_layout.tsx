import { LaunchSplash } from "@/components/launch-splash";
import { getTheme } from "@/constants/theme";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import {
  OnboardingProvider,
  useOnboarding,
} from "@/contexts/onboarding-context";
import { useAlarmHandoff } from "@/lib/alarms/alarm_handoff";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { StatusBar as RNStatusBar, View, useColorScheme } from "react-native";

void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  // Ends an alarm (and any pending snooze) when the user taps Dismiss on the ring screen.
  // It lives here, above the loading checks below, so it also runs on a cold launch.
  useAlarmHandoff();

  return (
    <AuthProvider>
      <OnboardingProvider>
        <RootNavigator />
      </OnboardingProvider>
    </AuthProvider>
  );
}

function RootNavigator() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { hasCompletedOnboarding, isLoading: onboardingLoading } =
    useOnboarding();

  const scheme = useColorScheme();
  const colors = getTheme(scheme ?? "light");

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background);
  }, [colors.background]);

  if (authLoading || onboardingLoading) {
    // Keep the native splash visible until initialization finishes.
    return null;
  }

  const baseTheme = scheme === "dark" ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...baseTheme,
    colors: { ...baseTheme.colors, background: colors.background },
  };

  return (
    <ThemeProvider value={navTheme}>
      {/* Root container: no padding, no insets, fills the whole window */}
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <RNStatusBar
          backgroundColor="transparent"
          barStyle={scheme === "dark" ? "light-content" : "dark-content"}
          translucent
        />

        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" />

          <Stack.Protected guard={!hasCompletedOnboarding}>
            <Stack.Screen name="(onboarding)" />
          </Stack.Protected>

          <Stack.Protected guard={hasCompletedOnboarding && !isAuthenticated}>
            <Stack.Screen name="(auth)/login" />
          </Stack.Protected>

          <Stack.Protected guard={hasCompletedOnboarding && isAuthenticated}>
            <Stack.Screen name="(tabs)" />
          </Stack.Protected>
        </Stack>

        {/* Last child of the root view, so it paints above everything */}
        <LaunchSplash />
      </View>
    </ThemeProvider>
  );
}