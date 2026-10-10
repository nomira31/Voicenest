import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const ONBOARDING_KEY = "voicenest_onboarding_completed";

export async function readOnboardingStatus(): Promise<boolean> {
  if (Platform.OS === "web") {
    if (typeof localStorage === "undefined") {
      return false;
    }

    return localStorage.getItem(ONBOARDING_KEY) === "true";
  }

  return (await SecureStore.getItemAsync(ONBOARDING_KEY)) === "true";
}

export async function saveOnboardingStatus(): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof localStorage === "undefined") {
      throw new Error("Browser storage is unavailable.");
    }

    localStorage.setItem(ONBOARDING_KEY, "true");
    return;
  }

  await SecureStore.setItemAsync(ONBOARDING_KEY, "true");
}

