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

/**
 * The first step whose requirements are not yet met. Note: "addons" is optional, never a gate.
 *
 * `offersEsim` is catalogue-derived (not in state), so it is passed in — the same flag `WizardPage`
 * uses. It defaults to `true` (both demo brands offer eSIM) so existing callers and tests keep
 * working. When the tenant offers eSIM, `/sim` is a REQUIRED gate (the user must pick a form before
 * moving on); when it doesn't, `/sim` never appears and is never gated. `/delivery` is gated only
 * for a PHYSICAL SIM (eSIM has no shipping) — in the ONBOARDING_STEPS order it sits just before
 * `review`, so a physical flow can't reach review/activate without an address.
 */
export function firstIncompleteStep(state: OnboardingState, offersEsim = true): OnboardingStep {
  if (state.selectedOfferId == null) return "plan";
  if (offersEsim && state.simType == null) return "sim";
  if (state.reservedMsisdn == null) return "number";
  if (state.email == null || state.givenName == null || state.familyName == null) {
    return "account";
  }
  if (state.simType === "physical" && state.deliveryAddress == null) return "delivery";
  if (state.customerId == null) return "review";
  return "success";
}

// Derived from ONBOARDING_STEPS so the order can never drift out of sync when a step is added.
const ORDER: readonly OnboardingStep[] = ONBOARDING_STEPS;

/** Where to send the user for `target`: `target` itself if reachable, else the first gap. */
export function resolveOnboardingStep(
  target: OnboardingStep,
  state: OnboardingState,
  offersEsim = true,
): OnboardingStep {
  const gap = firstIncompleteStep(state, offersEsim);
  return ORDER.indexOf(target) <= ORDER.indexOf(gap) ? target : gap;
}
