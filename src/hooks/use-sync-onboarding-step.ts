import { useEffect } from "react";

import { useOnboarding } from "@/hooks/use-onboarding";
import type { OnboardingStep } from "@/lib/onboarding-context";

/*
 * Keep the persisted wizard `step` in sync with the route the user is actually on. Each step page
 * calls this with its own step id; on mount it records that step (so a refresh resumes here and
 * the stepper/announcement reflect the real position). Only writes when the value changes, to
 * avoid a redundant localStorage write / render loop.
 */
export function useSyncOnboardingStep(step: OnboardingStep): void {
  const { state, patch } = useOnboarding();
  useEffect(() => {
    if (state.step !== step) {
      patch({ step });
    }
  }, [step, state.step, patch]);
}
