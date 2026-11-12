import type { Offer } from "@/services/model";

/*
 * Catalog qualification — a PURE rule. (Spec Fase 4.2 / Fase 5 TMF679 alignment)
 *
 * Whether an offer can be bought in a given context. Kept pure so the eligibility reason the UI
 * shows (aria-disabled + visible reason) is testable without a backend. No I/O, no throw.
 *
 * The result follows the real TMF679 Product Offering Qualification shape (see
 * docs/contracts/tmf679-po-qualification.md), not a bare boolean: qualified | unqualified |
 * alternate. The mock catalog driver and (later) the real ECM both return this shape, so the UI
 * (which only ever sees QualifyResult) doesn't change when the backend goes real.
 */

export interface QualifyFacts {
  offer: Offer;
  /** True when the context has a customer (buying an add-on); false during onboarding. */
  hasCustomer: boolean;
  /** The customer's current prepaid balance in minor units, when known. */
  balanceMinor?: number;
}

/** TMF679 qualificationItemResult: available / not available / not available but alternate exists. */
export type QualificationResult = "qualified" | "unqualified" | "alternate";

export interface QualifyResult {
  result: QualificationResult;
  /** i18n key for the reason when not qualified — the UI shows it next to the disabled offer. */
  reasonKey?: string;
  /** When `result` is "alternate", the offer id to propose instead (TMF679 alternateProposal). */
  alternativeOfferId?: string;
}

/**
 * Decide qualification. Rules (demo-scope, deliberately small):
 *  - An onboarding bundle (no customer yet) is always `qualified` — it's the first purchase.
 *  - For an existing customer, an offer priced above the current balance is `unqualified`
 *    ("top up first"), since prepaid pays from balance.
 *
 * The `alternate` result (propose a cheaper offer) is part of the shape for the real TMF679 and
 * the recommendation hook, but the mock rule does not synthesise alternatives — it returns
 * `qualified` or `unqualified`. A real ECM would fill `alternativeOfferId`.
 */
export function qualifyOffer(facts: QualifyFacts): QualifyResult {
  if (!facts.hasCustomer) {
    return { result: "qualified" };
  }
  if (facts.balanceMinor != null && facts.offer.priceMinor > facts.balanceMinor) {
    // TODO(Fase 8): a real ECM returns "alternate" here with alternativeOfferId populated from
    // the TMF679 alternateProductOfferingProposal (a cheaper offer within balance). The mock
    // stays "unqualified" — it does not synthesise alternatives.
    return { result: "unqualified", reasonKey: "offer.ineligible.insufficientBalance" };
  }
  return { result: "qualified" };
}
