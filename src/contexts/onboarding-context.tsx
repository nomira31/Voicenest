import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";

import { readOnboardingStatus, saveOnboardingStatus } from "@/lib/onboarding";

type OnboardingContextValue = {
  hasCompletedOnboarding: boolean;
  isLoading: boolean;
  completeOnboarding: () => Promise<void>;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const completed = await readOnboardingStatus();

        if (active) {
          setHasCompletedOnboarding(completed);
        }
      } catch {
        if (active) {
          setHasCompletedOnboarding(false);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void initialize();

    return () => {
      active = false;
    };
  }, []);

  const completeOnboarding = useCallback(async () => {
    await saveOnboardingStatus();
    setHasCompletedOnboarding(true);
  }, []);

  const value = useMemo(
    () => ({
      hasCompletedOnboarding,
      isLoading,
      completeOnboarding,
    }),
    [hasCompletedOnboarding, isLoading, completeOnboarding],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);

  if (!context) {
    throw new Error("useOnboarding must be used inside OnboardingProvider.");
  }

  return context;
}
