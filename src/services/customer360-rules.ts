import type {
  Balance,
  Customer,
  Customer360,
  Party,
  PartyInteraction,
  Product,
} from "@/services/model";

/*
 * Customer360 composition — a PURE rule. (Spec Fase 3.2)
 *
 * The 360 view is assembled from three systems: party/customer (CPR), installed base (order/
 * EOC), and balance (charging/ECEV). Per the review + the DMP Value Accelerator HLD, this
 * composition lives here — NOT inside any connector — so it is unit-testable without a backend
 * and identical whether CPR is real or mocked. No I/O, no throw.
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
}

/** Compose the canonical Customer360 from the sources. Deterministic. */
export function composeCustomer360(parts: Customer360Parts): Customer360 {
  return {
    customer: parts.customer,
    party: parts.party,
    // Stable order: plan first, then add-ons, then the SIM — so the Home/Account view reads
    // the same way every time regardless of the order systems return products in.
    installedBase: [...parts.installedBase].sort(
      (a, b) => productKindRank(a.kind) - productKindRank(b.kind),
    ),
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

/** The customer's primary plan, if one is provisioned. */
export function primaryPlan(c360: Customer360): Product | null {
  return c360.installedBase.find((p) => p.kind === "plan") ?? null;
}
