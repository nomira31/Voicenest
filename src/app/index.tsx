import { Redirect } from "expo-router";

import { useAuth } from "@/contexts/auth-context";
import { useOnboarding } from "@/contexts/onboarding-context";

export default function IndexScreen() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const { hasCompletedOnboarding, isLoading: onboardingLoading } =
    useOnboarding();

  if (authLoading || onboardingLoading) {
    return null;
  }

  if (!hasCompletedOnboarding) {
    return <Redirect href="/(onboarding)" />;
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return <Redirect href="/(tabs)" />;
}
