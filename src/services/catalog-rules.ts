import type { Offer } from "@/services/model";

/*
 * Catalog eligibility — a PURE rule. (Spec Fase 4.2)
 *
 * Whether an offer can be bought in a given context. Kept pure so the eligibility reason the
 * UI shows (aria-disabled + visible reason) is testable without a backend. No I/O, no throw.
 * The mock catalog driver and (later) the real ECM both call this to decide qualify results.
 */

export interface QualifyFacts {
  offer: Offer;
  /** True when the context has a customer (buying an add-on); false during onboarding. */
  hasCustomer: boolean;
  /** The customer's current prepaid balance in minor units, when known. */
  balanceMinor?: number;
}

export interface QualifyResult {
  eligible: boolean;
  /** i18n key for the reason when not eligible — the UI shows it next to the disabled offer. */
  reasonKey?: string;
}

/**
 * Decide eligibility. Rules (demo-scope, deliberately small):
 *  - An onboarding bundle (no customer yet) is always eligible — it's the first purchase.
 *  - For an existing customer, an offer priced above the current balance is ineligible
 *    ("top up first"), since prepaid pays from balance.
 */
export function qualifyOffer(facts: QualifyFacts): QualifyResult {
  if (!facts.hasCustomer) {
    return { eligible: true };
  }
  if (facts.balanceMinor != null && facts.offer.priceMinor > facts.balanceMinor) {
    return { eligible: false, reasonKey: "offer.ineligible.insufficientBalance" };
  }
  return { eligible: true };
}
