import type {
  Balance,
  Customer,
  Customer360,
  EnrichedProduct,
  Offer,
  Party,
  PartyInteraction,
  Product,
} from "@/services/model";

/*
 * Customer360 composition — a PURE rule. (Spec Fase 3.2)
 *
 * The 360 view is assembled from several systems: party/customer + interactions (CPR), installed
 * base (order/EOC), balance (charging/ECEV), and the catalogue (ECM, joined onto the installed
 * base). Per the review + the DMP Value Accelerator HLD, this composition lives here — NOT inside
 * any connector — so it is unit-testable without a backend and identical whether CPR is real or
 * mocked. No I/O, no throw.
 */

export interface Customer360Parts {
  customer: Customer;
  party: Party;
  /** Installed base from the order seam; empty for a brand-new customer. */
  installedBase: Product[];
  /** Balance from the charging seam; null when the customer has no prepaid balance yet. */
  balance: Balance | null;
  /** Party interactions (TMF683) from CPR; empty when none. */
  interactions?: PartyInteraction[];
  /**
   * Catalogue offers (ECM) used to enrich the installed base — the plans and add-ons for the
   * tenant. Empty/absent when the catalogue is unavailable; each product's `offer` then resolves
   * to null (the screen falls back to the product's own name).
   */
  offers?: Offer[];
}

/** Compose the canonical Customer360 from the sources. Deterministic. */
export function composeCustomer360(parts: Customer360Parts): Customer360 {
  // offerId -> Offer, so the installed-base join is O(1) per product. A product whose offerId has
  // no catalogue entry (the SIM PO) resolves to null — never an error, never a raw id downstream.
  const offers = parts.offers ?? [];
  const offerById = new Map<string, Offer>(offers.map((o) => [o.offerId, o]));
  // A duplicate offerId across the catalogue (e.g. a plan and add-on sharing an id, or a versioning
  // slip) would silently last-writer-win and mis-join a product. The real ECM shouldn't produce
  // this, but warn in dev so a bad catalogue is caught rather than quietly showing the wrong offer.
  if (import.meta.env.DEV && offerById.size !== offers.length) {
    console.warn("composeCustomer360: duplicate offerId in catalogue — join may be ambiguous");
  }

  return {
    customer: parts.customer,
    party: parts.party,
    // Stable order: plan first, then add-ons, then the SIM — so the Home/Account view reads the
    // same way every time — then enrich each product with its catalogue offer (null when none).
    installedBase: [...parts.installedBase]
      .sort((a, b) => productKindRank(a.kind) - productKindRank(b.kind))
      .map((p): EnrichedProduct => ({ ...p, offer: offerById.get(p.offerId) ?? null })),
    balance: parts.balance,
    // Newest first, so the activity timeline reads top-down regardless of source order.
    interactions: [...(parts.interactions ?? [])].sort((a, b) =>
      b.occurredAt.localeCompare(a.occurredAt),
    ),
  };
}

function productKindRank(kind: Product["kind"]): number {
  switch (kind) {
    case "plan":
      return 0;
    case "add-on":
      return 1;
    case "sim":
      return 2;
  }
}

/** Does the customer have a usable prepaid balance? (UI: show balance vs. "no balance yet".) */
export function hasBalance(c360: Customer360): boolean {
  return c360.balance != null && c360.balance.amountMinor > 0;
}

/** The customer's primary plan (catalogue-enriched), if one is provisioned. */
export function primaryPlan(c360: Customer360): EnrichedProduct | null {
  return c360.installedBase.find((p) => p.kind === "plan") ?? null;
}
