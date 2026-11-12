import { useContext } from "react";

import { OnboardingContext, type OnboardingContextValue } from "@/lib/onboarding-context";

/*
 * useOnboarding — read/update the wizard state. Must be used inside <OnboardingProvider> (the
 * /onboarding layout mounts it), so the guard turns a missing provider into a clear error instead
 * of a silent null.
 */
export function useOnboarding(): OnboardingContextValue {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error("useOnboarding must be used within <OnboardingProvider>");
  }
  return context;
}
