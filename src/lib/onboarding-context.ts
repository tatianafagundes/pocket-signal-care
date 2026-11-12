import { createContext } from "react";

import type { TenantId } from "@/lib/tenant-rules";
import type { DeliveryAddress, SimChoice } from "@/services/model";

/*
 * Onboarding wizard context. (Spec Fase 5 / onboarding-journey Req 1, 6.3, 9.1)
 *
 * Holds the non-secret state that travels across the wizard steps, plus the orchestration ids
 * the submit step fills in (partyId/customerId/cartId). It is the single in-session source of
 * truth for "where the user is" and "what they've chosen so far".
 *
 * SECRETS NEVER LIVE HERE. The password is an auth secret — it stays in the account form's memory
 * and the auth seam argument, and never touches this context, localStorage, a log, or CPR
 * (locked decision, Fase A). The session token is likewise out of scope here.
 *
 * Context identity is kept in src/lib/ (outside the provider component and the hook) so Fast
 * Refresh stays stable — same rule the tenant context follows.
 */

/** The wizard steps, in order. The index in this array is the step number (1-based for display). */
export const ONBOARDING_STEPS = [
  "welcome",
  "plan",
  "number",
  "account",
  "sim",
  "delivery",
  "review",
  "success",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/*
 * Whether the active tenant/catalogue offers eSIM at all. Today both demo brands do, so this is a
 * constant — but it is the SINGLE source both the step guard (resolveOnboardingStep) and the chrome
 * (WizardPage) read, so they can never disagree about whether `/sim` exists. When a real
 * `offersEsim=false` tenant appears, derive this from the catalogue/tenant config in ONE place.
 * TODO(Fase 8): resolve from the catalogue (an offer with no eSIM in any simTypes) or tenant rules.
 */
export const TENANT_OFFERS_ESIM = true;

/**
 * All possible working steps, excluding the terminal "success" screen — the SUPERSET. Since Fase 7,
 * two of these are CONDITIONAL: `sim` shows only when the tenant offers eSIM, and `delivery` shows
 * only for a physical SIM. So this flat list is NOT the per-flow "Step N of M" any more — the
 * actual working steps depend on state. Use `workingStepsFor(state)` for the real sequence, and
 * `ONBOARDING_WORKING_STEPS` only as the exhaustive catalogue (order + membership).
 */
export const ONBOARDING_WORKING_STEPS = ONBOARDING_STEPS.filter(
  (s) => s !== "success",
) as readonly Exclude<OnboardingStep, "success">[];

/**
 * The working steps for a given flow, in order — the real "Step N of M". `sim` drops when the
 * flow has no eSIM choice to make; `delivery` drops for eSIM (no shipping). Pure, so the stepper
 * and the "N of M" announcement read the exact same sequence and can't drift.
 *
 * `offersEsim`: does the tenant/catalogue offer eSIM at all? When false, `/sim` never appears.
 * `simType`: once chosen, an eSIM flow has no `/delivery`. Before a physical/eSIM choice is known,
 * `delivery` is kept in the count (optimistic) so the number doesn't jump UP later; choosing eSIM
 * only ever removes a step, and the stepper hides the total until the choice is made (see
 * wizard-page) so the user never sees the count shrink on screen.
 *
 * INVARIANT: `simType` is only ever non-null when `offersEsim` is true — `/sim` is the only place
 * it gets set. The combination `{ offersEsim: false, simType: "physical" }` is impossible in a
 * real flow; the filter still returns a valid list for it (no `sim`, keeps `delivery`), but don't
 * construct that combination by hand in later tasks.
 */
export function workingStepsFor(opts: {
  offersEsim: boolean;
  simType: SimChoice | null;
}): readonly Exclude<OnboardingStep, "success">[] {
  return ONBOARDING_WORKING_STEPS.filter((s) => {
    if (s === "sim") return opts.offersEsim;
    if (s === "delivery") return opts.simType !== "esim";
    return true;
  });
}

/**
 * The persisted, non-secret wizard state. Everything here is safe to write to localStorage:
 * identifiers and user-entered non-secret fields. NO password, NO token.
 */
export interface OnboardingState {
  /** The tenant captured when onboarding started — pinned so a mid-flow brand change can't split it. */
  tenant: TenantId;
  /** The furthest step the user has reached, for resume-on-refresh. */
  step: OnboardingStep;
  /** Chosen plan offer id (catalog). */
  selectedOfferId: string | null;
  /** Chosen add-on offer ids (optional; empty when none). Added to the activation cart at submit. */
  selectedAddOnIds: string[];
  /*
   * SIM form the user picked (`/sim` step, Fase 7). `null` until chosen. Drives whether
   * `/delivery` is required (physical) or skipped (eSIM).
   */
  simType: SimChoice | null;
  /** Reserved MSISDN (resource seam) — the conceptual resume pivot. */
  reservedMsisdn: string | null;
  /** Account email (not a secret; the password is never stored). */
  email: string | null;
  /*
   * The email the auth account was registered under, set once `register` succeeds. Non-null means
   * the account already exists: revisiting the account step edits name/email in place (email via
   * `changeEmail`) instead of registering again, and no password is asked for.
   */
  registeredEmail: string | null;
  /** Personal details. */
  givenName: string | null;
  familyName: string | null;
  /*
   * Delivery address (`/delivery` step, Fase 7) — only for a PHYSICAL SIM; stays `null` for eSIM.
   * Personal data, but non-secret: it's the same class as name/email already here.
   */
  deliveryAddress: DeliveryAddress | null;
  /** Orchestration ids the submit step populates (CPR/order). */
  partyId: string | null;
  customerId: string | null;
  cartId: string | null;
  /*
   * Fase 7 money/order orchestration ids the submit fills in. BOTH must be persisted and REUSED
   * on retry (like partyId/customerId) so a retry never authorizes the card twice nor re-submits
   * the order — the dossiê's "Don't pay again" rule. No PAN/CVV/token is ever stored here.
   *
   * `addressId`: returned by `logistics.createAddress` (TMF673), physical SIM only.
   * `esimProfileId`: returned by `resource.requestEsimProfile`, eSIM only. Reused on retry.
   * `authorizationRef`: set from `PaymentResult.authorizationRef` at the authorize step; 7.4 reuses
   *   it on every retry path (skip authorize if present).
   * `orderId`: captured from `submitOrder`'s result; skip submitOrder if present.
   * `captured` / `credited`: money milestones already done, so a retry after a later failure does
   *   NOT capture or credit twice (the "Don't pay again" rule — see runOnboardingSubmit).
   */
  addressId: string | null;
  esimProfileId: string | null;
  authorizationRef: string | null;
  orderId: string | null;
  captured: boolean;
  credited: boolean;
  /**
   * Party Interaction (TMF683) recorded at order fulfilment. Persisted + reused on retry so a
   * resumed submit never logs the onboarding interaction twice ("Don't pay again", applied to the
   * interaction log).
   */
  interactionId: string | null;
}

/** The fields a caller may patch. `tenant` is set once at init and not patched here. */
export type OnboardingPatch = Partial<Omit<OnboardingState, "tenant">>;

export interface OnboardingContextValue {
  state: OnboardingState;
  /** Merge a partial update into the state (and persist it). */
  patch: (patch: OnboardingPatch) => void;
  /** Reset the wizard to its initial state for the current tenant (and clear persistence). */
  reset: () => void;
  /**
   * False on the server and the first client render (clean state, so hydration matches); true
   * once saved progress has been read back. Redirect decisions must wait for it.
   */
  restored: boolean;
}

// Keep context identity outside refreshable components and hooks (Fast Refresh stability).
export const OnboardingContext = createContext<OnboardingContextValue | null>(null);

type WorkingStep = Exclude<OnboardingStep, "success">;
type FlowOpts = { offersEsim: boolean; simType: SimChoice | null };

/** The step Continue leads to from `step` in this flow (review leads to success). */
export function stepAfter(step: WorkingStep, opts: FlowOpts): OnboardingStep {
  const steps = workingStepsFor(opts);
  return steps[steps.indexOf(step) + 1] ?? "success";
}

/** The step Back leads to from `step` in this flow (welcome stays on welcome). */
export function stepBefore(step: WorkingStep, opts: FlowOpts): WorkingStep {
  const steps = workingStepsFor(opts);
  return steps[Math.max(0, steps.indexOf(step) - 1)] ?? "welcome";
}
