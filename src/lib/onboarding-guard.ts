import {
  ONBOARDING_STEPS,
  stepAfter,
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
  if (state.reservedMsisdn == null) return "number";
  if (state.email == null || state.givenName == null || state.familyName == null) {
    return "account";
  }
  if (offersEsim && state.simType == null) return "sim";
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

export interface ContinueTarget {
  /** Where Continue leads. */
  to: OnboardingStep;
  /** True when Continue skips ahead to Review (label it "Save and return to review"). */
  returnsToReview: boolean;
}

/**
 * Where Continue on `step` leads, given the state AFTER this step's change. Normally the next
 * step; but when every step after it is still complete (the user came back from Review to change
 * one thing), it skips straight to the first unfinished step — usually Review. If the change made
 * a later step incomplete (e.g. switching to a physical SIM now needs an address), it stops there.
 */
export function continueTarget(
  step: Exclude<OnboardingStep, "success" | "review">,
  state: OnboardingState,
  offersEsim = true,
): ContinueTarget {
  const natural = stepAfter(step, { offersEsim, simType: state.simType });
  const gap = firstIncompleteStep(state, offersEsim);
  // Never skip past Review: the order is placed there, not here.
  const capped: OnboardingStep = gap === "success" ? "review" : gap;
  const to = ORDER.indexOf(capped) > ORDER.indexOf(natural) ? capped : natural;
  return { to, returnsToReview: to === "review" && natural !== "review" };
}
