import { createContext } from "react";

import type { TenantId } from "@/lib/tenant-rules";

/*
 * Onboarding wizard context. (Spec Fase 5 / onboarding-journey Req 1, 6.3, 9.1)
 *
 * Holds the non-secret state that travels across the 7 wizard steps, plus the orchestration ids
 * the submit step fills in (partyId/customerId/cartId). It is the single in-session source of
 * truth for "where the user is" and "what they've chosen so far".
 *
 * SECRETS NEVER LIVE HERE. The password is an auth secret — it stays in the account form's memory
 * and the auth seam argument, and never touches this context, sessionStorage, a log, or CPR
 * (locked decision, Fase A). The session token is likewise out of scope here.
 *
 * Context identity is kept in src/lib/ (outside the provider component and the hook) so Fast
 * Refresh stays stable — same rule the tenant context follows.
 */

/** The wizard steps, in order. The index in this array is the step number (1-based for display). */
export const ONBOARDING_STEPS = [
  "welcome",
  "plan",
  "account",
  "details",
  "number",
  "review",
  "success",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** Total number of steps, including the terminal success screen. */
export const ONBOARDING_STEP_COUNT = ONBOARDING_STEPS.length;

/**
 * The steps the user actively works through, excluding the terminal "success" screen. This is the
 * "M" in "Step N of M": success is an outcome, not a step to complete, so it is not counted — and
 * the progress stepper shows exactly these. Keeping the count here means the announcement and the
 * stepper can't drift apart.
 */
export const ONBOARDING_WORKING_STEPS = ONBOARDING_STEPS.filter(
  (s) => s !== "success",
) as readonly Exclude<OnboardingStep, "success">[];

export const ONBOARDING_WORKING_STEP_COUNT = ONBOARDING_WORKING_STEPS.length;

/**
 * The persisted, non-secret wizard state. Everything here is safe to write to sessionStorage:
 * identifiers and user-entered non-secret fields. NO password, NO token.
 */
export interface OnboardingState {
  /** The tenant captured when onboarding started — pinned so a mid-flow brand change can't split it. */
  tenant: TenantId;
  /** The furthest step the user has reached, for resume-on-refresh. */
  step: OnboardingStep;
  /** Chosen plan offer id (catalog). */
  selectedOfferId: string | null;
  /** Reserved MSISDN (resource seam) — the conceptual resume pivot. */
  reservedMsisdn: string | null;
  /** Account email (not a secret; the password is never stored). */
  email: string | null;
  /** Personal details. */
  givenName: string | null;
  familyName: string | null;
  /** Orchestration ids the submit step populates (CPR/order). */
  partyId: string | null;
  customerId: string | null;
  cartId: string | null;
}

/** The fields a caller may patch. `tenant` is set once at init and not patched here. */
export type OnboardingPatch = Partial<Omit<OnboardingState, "tenant">>;

export interface OnboardingContextValue {
  state: OnboardingState;
  /** Merge a partial update into the state (and persist it). */
  patch: (patch: OnboardingPatch) => void;
  /** Reset the wizard to its initial state for the current tenant (and clear persistence). */
  reset: () => void;
}

// Keep context identity outside refreshable components and hooks (Fast Refresh stability).
export const OnboardingContext = createContext<OnboardingContextValue | null>(null);
