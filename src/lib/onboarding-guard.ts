import {
  ONBOARDING_STEPS,
  type OnboardingState,
  type OnboardingStep,
} from "@/lib/onboarding-context";

/*
 * Onboarding step guard. A step is reachable only when every earlier REQUIRED step is complete,
 * so a deep link can't skip ahead (e.g. open "success" without activating). Pure + testable.
 *
 * The "addons" step is OPTIONAL: firstIncompleteStep never points at it (there is no add-on
 * requirement), so a user can always reach it and can always move past it without choosing one.
 */

/** The first step whose requirements are not yet met. Note: "addons" is optional, never a gate. */
export function firstIncompleteStep(state: OnboardingState): OnboardingStep {
  if (state.selectedOfferId == null) return "plan";
  if (state.reservedMsisdn == null) return "number";
  if (state.email == null || state.givenName == null || state.familyName == null) {
    return "account";
  }
  if (state.customerId == null) return "review";
  return "success";
}

// Derived from ONBOARDING_STEPS so the order can never drift out of sync when a step is added.
const ORDER: readonly OnboardingStep[] = ONBOARDING_STEPS;

/** Where to send the user for `target`: `target` itself if reachable, else the first gap. */
export function resolveOnboardingStep(
  target: OnboardingStep,
  state: OnboardingState,
): OnboardingStep {
  const gap = firstIncompleteStep(state);
  return ORDER.indexOf(target) <= ORDER.indexOf(gap) ? target : gap;
}
