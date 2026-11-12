import type {
  Balance,
  BucketState,
  Customer,
  Customer360,
  EnrichedProduct,
  Offer,
  Party,
  PartyInteraction,
  Product,
  UsageBucket,
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
  /**
   * Non-monetary allowance buckets (TMF654) from the charging/ECEV seam; empty/absent when the
   * line has no buckets or the seam is unavailable (the 360 then shows no usage, never an error).
   */
  usage?: UsageBucket[];
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
    // Stable order data→voice→sms→roaming, so the usage panel reads the same way every time
    // regardless of the order the seam returned buckets in.
    usage: [...(parts.usage ?? [])].sort((a, b) => usageTypeRank(a.type) - usageTypeRank(b.type)),
    // Newest first, so the activity timeline reads top-down regardless of source order.
    interactions: [...(parts.interactions ?? [])].sort((a, b) =>
      b.occurredAt.localeCompare(a.occurredAt),
    ),
  };
}

function usageTypeRank(type: UsageBucket["type"]): number {
  switch (type) {
    case "data":
      return 0;
    case "voice":
      return 1;
    case "sms":
      return 2;
    case "roaming":
      return 3;
  }
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

/**
 * The data bucket the Home shows as its ring — a PURE rule. The Home surfaces ONE data allowance
 * (the prototype's P1 "Data" card); the full set (voice/SMS/roaming, add-on data) lives on My plan.
 *
 * Preference: the data bucket granted by the plan (its offerId matches the primary plan's offerId),
 * so a bought data add-on doesn't displace the plan's own allowance on the Home. Falls back to the
 * first data bucket, then null (Data card → empty state). No I/O.
 */
export function primaryDataBucket(c360: Customer360): UsageBucket | null {
  const planOfferId = primaryPlan(c360)?.offerId;
  const data = c360.usage.filter((b) => b.type === "data");
  return data.find((b) => b.offerId === planOfferId) ?? data[0] ?? null;
}

/**
 * Fraction of the granted total at or below which a metered bucket is "low" — 0.2 means the warning
 * fires once 80% is consumed (20% remaining). No GSMA/ITU normative threshold exists; 0.2 is the
 * common default (Google Mobile Data Plan API's LOW_QUOTA, operator practice). A second, earlier
 * notice tier (e.g. 50%) is deliberately deferred — one threshold until a product need appears.
 */
export const LOW_REMAINING_RATIO = 0.2;

/**
 * Derived display state of a usage bucket — a PURE rule, no I/O, no throw. (Spec Fase: usage buckets)
 *
 * Evaluated as a priority ladder, first match wins, so the states are mutually exclusive:
 *   1. expired  — validFor.end in the past (a lapsed bucket is lapsed whatever is left in it).
 *   2. pending  — validFor.start in the future (bought but not yet active; nothing to show as left).
 *   3. unlimited ⇒ ok — once it is active (not expired/pending), an unlimited bucket has no number
 *      to be low or depleted; it is always ok. (Default choice, not a research-backed rule.)
 *   4. depleted — metered and nothing remaining.
 *   5. low      — metered and remaining ≤ LOW_REMAINING_RATIO of total.
 *   6. ok       — everything else.
 *
 * Validity is checked before quantity on purpose: an expired or not-yet-started bucket should read
 * as such even if its numbers look healthy (future add-on) or empty (lapsed, consumed). `now` is
 * injectable so tests are deterministic.
 */
export function bucketState(bucket: UsageBucket, now: Date = new Date()): BucketState {
  const t = now.getTime();

  const endMs = parseIso(bucket.validFor?.end);
  if (endMs !== null && endMs < t) return "expired";

  const startMs = parseIso(bucket.validFor?.start);
  if (startMs !== null && startMs > t) return "pending";

  if (bucket.unlimited) return "ok";

  // Metered from here. A bucket with no readable remaining can't be judged — treat as ok rather
  // than invent a warning.
  const remaining = bucket.remaining?.value;
  if (remaining === undefined) return "ok";
  if (remaining <= 0) return "depleted";

  // "low" needs a denominator; without a usable total we can't compute a ratio, so it stays ok.
  const total = bucket.total?.value;
  if (total !== undefined && total > 0 && remaining / total <= LOW_REMAINING_RATIO) return "low";

  return "ok";
}

/** Parse an ISO date to epoch ms; null when absent or unparseable (so a bad date never throws). */
function parseIso(iso: string | undefined): number | null {
  if (iso === undefined) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * How much the customer must top up so the balance covers the next plan renewal, in minor units.
 * 0 when the balance already covers it (or there is no priced plan). Pure; never negative.
 */
export function renewalShortfall(c360: Customer360): number {
  const price = primaryPlan(c360)?.offer?.priceMinor;
  if (price === undefined) return 0;
  const balance = c360.balance?.amountMinor ?? 0;
  return Math.max(0, price - balance);
}

/** The line's SIM form ("esim" | "physical"), when a SIM product is installed. */
export function lineSimType(c360: Customer360): Product["simType"] | null {
  return c360.installedBase.find((p) => p.kind === "sim")?.simType ?? null;
}

/**
 * When the plan next renews: the end of the plan's current data cycle (the bucket the plan granted),
 * else the balance validity. Null when neither is known. Pure.
 */
export function planRenewsAt(c360: Customer360): string | null {
  const plan = primaryPlan(c360);
  const cycle = c360.usage.find(
    (b) => b.type === "data" && (!plan || !b.offerId || b.offerId === plan.offerId),
  )?.validFor?.end;
  return cycle ?? c360.balance?.validUntil ?? null;
}
