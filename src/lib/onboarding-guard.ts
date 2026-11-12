import type { OnboardingState, OnboardingStep } from "@/lib/onboarding-context";

/*
 * Onboarding step guard. A step is reachable only when every earlier step is complete, so a
 * deep link can't skip ahead (e.g. open "success" without activating). Pure + testable.
 */

/** The first step whose requirements are not yet met. */
export function firstIncompleteStep(state: OnboardingState): OnboardingStep {
  if (state.selectedOfferId == null) return "plan";
  if (state.reservedMsisdn == null) return "number";
  if (state.email == null || state.givenName == null || state.familyName == null) {
    return "account";
  }
  if (state.customerId == null) return "review";
  return "success";
}

const ORDER: readonly OnboardingStep[] = [
  "welcome",
  "plan",
  "number",
  "account",
  "review",
  "success",
];

/** Where to send the user for `target`: `target` itself if reachable, else the first gap. */
export function resolveOnboardingStep(
  target: OnboardingStep,
  state: OnboardingState,
): OnboardingStep {
  const gap = firstIncompleteStep(state);
  return ORDER.indexOf(target) <= ORDER.indexOf(gap) ? target : gap;
}
