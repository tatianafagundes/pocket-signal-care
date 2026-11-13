import type {
  ActivityItem,
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
  /**
   * Financial activity (top-ups/refills/adjustments) from the charging seam (real DMP: TMF654
   * Prepay Balance Management for top-ups/refills, Financial Transaction Enquiry for
   * payments/refunds/adjustments); empty/absent when none or the seam is unavailable.
   */
  activity?: ActivityItem[];
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
    // Financial activity, newest first — the "recent activity / last top-ups" feed.
    activity: [...(parts.activity ?? [])].sort(byOccurredAtDesc((a) => a.activityId)),
    // Newest first, so the activity timeline reads top-down regardless of source order.
    interactions: [...(parts.interactions ?? [])].sort(byOccurredAtDesc((i) => i.interactionId)),
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

/**
 * Compare two timelined records newest-first by `occurredAt`, with a DETERMINISTIC tie-breaker.
 *
 * `occurredAt` alone isn't enough: when two events share the same timestamp (two records created in
 * the same millisecond — common in the mock, possible in a real feed), a plain `localeCompare` on
 * the timestamp returns 0 and the result order falls back to the input order. That made the sort
 * unstable and a "newest-first" assertion flaky. We break the tie on the record's id, descending —
 * a stable, reproducible order. It does NOT claim the higher id is "newer" (ids aren't a clock);
 * it only guarantees the SAME order every time two timestamps are equal.
 */
function byOccurredAtDesc<T extends { occurredAt: string }>(idOf: (x: T) => string) {
  return (a: T, b: T): number => {
    const byTime = b.occurredAt.localeCompare(a.occurredAt);
    return byTime !== 0 ? byTime : idOf(b).localeCompare(idOf(a));
  };
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

/** Display status of the line: suspended wins, then pending (customer or plan), else active. */
export type LineStatus = "active" | "pending" | "suspended";

/** The line's status as one word for the UI. Pure. */
export function lineStatus(c360: Customer360): LineStatus {
  if (c360.customer.status === "suspended") return "suspended";
  if (c360.customer.status === "pending") return "pending";
  if (primaryPlan(c360)?.status === "pending") return "pending";
  return "active";
}

/** Display state of the prepaid balance. */
export type BalanceState = "none" | "expired" | "empty" | "ok";

/**
 * Balance state, first match wins: none (no record yet) → expired (validUntil in the past) →
 * empty (zero or less) → ok. `now` is injectable for deterministic tests. Pure.
 */
export function balanceState(c360: Customer360, now: Date = new Date()): BalanceState {
  const b = c360.balance;
  if (b == null) return "none";
  const until = parseIso(b.validUntil);
  if (until !== null && until < now.getTime()) return "expired";
  if (b.amountMinor <= 0) return "empty";
  return "ok";
}

/** Add-ons on the installed base (catalogue-enriched), in installed-base order. Pure. */
export function activeAddOns(c360: Customer360): EnrichedProduct[] {
  return c360.installedBase.filter((p) => p.kind === "add-on");
}

/** The one attention notice Home shows above the balance, or none. */
export type HomeNotice = "suspended" | "renewal" | null;

/**
 * One alarm at a time: a suspended line explains everything else (no balance, no renewal), so it
 * wins; otherwise the renewal shortfall notice; otherwise nothing. Pure.
 */
export function homeNotice(c360: Customer360): HomeNotice {
  if (lineStatus(c360) === "suspended") return "suspended";
  if (renewalShortfall(c360) > 0) return "renewal";
  return null;
}

/** True when the balance already covers the next renewal of a priced plan. Pure. */
export function renewalCovered(c360: Customer360): boolean {
  const price = primaryPlan(c360)?.offer?.priceMinor;
  if (price === undefined) return false;
  return renewalShortfall(c360) === 0;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole calendar days (UTC) from `now` to `iso`: 0 = today, 1 = tomorrow, negative = past.
 * Null when the date is unparseable. Pure.
 */
export function daysUntil(iso: string, now: Date = new Date()): number | null {
  const target = parseIso(iso);
  if (target === null) return null;
  const t = new Date(target);
  const startOf = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((startOf(t) - startOf(now)) / DAY_MS);
}

/** Up to this many days ahead, a renewal reads relative ("in 25 days"); beyond it, as a date. */
export const RELATIVE_RENEWAL_MAX_DAYS = 30;

/** How to show the next renewal: relative days when soon, else the date. Null when unknown. */
export type RenewalWhen = { iso: string; days: number; relative: boolean };

/** The plan's next renewal, ready for display (see RELATIVE_RENEWAL_MAX_DAYS). Pure. */
export function renewalWhen(c360: Customer360, now: Date = new Date()): RenewalWhen | null {
  const iso = planRenewsAt(c360);
  if (iso === null) return null;
  const days = daysUntil(iso, now);
  if (days === null) return null;
  return { iso, days, relative: days >= 0 && days <= RELATIVE_RENEWAL_MAX_DAYS };
}

/**
 * Whether the Home Plan card should show its "Renews … / automatically from your balance" lines.
 * False when the line is suspended (it is not renewing — the suspended notice explains that), when
 * the plan is still pending (it shows a Pending badge instead), or when there is no renewal date.
 * A suspended, €0 line claiming it renews automatically was the Customer-360 review finding. Pure.
 */
export function planRenewalVisible(c360: Customer360, now: Date = new Date()): boolean {
  if (lineStatus(c360) === "suspended") return false;
  if (primaryPlan(c360)?.status === "pending") return false;
  return renewalWhen(c360, now) !== null;
}

/** Home "Add data" prompt: shown only when the primary data allowance is low or used up. */
export type HomeDataPrompt = "low" | "depleted" | null;

/** Which Add data prompt Home shows, if any (unlimited / ok / expired / no data → none). Pure. */
export function homeDataPrompt(c360: Customer360, now: Date = new Date()): HomeDataPrompt {
  const bucket = primaryDataBucket(c360);
  if (bucket === null || bucket.unlimited) return null;
  const state = bucketState(bucket, now);
  return state === "low" || state === "depleted" ? state : null;
}

/**
 * One row of the merged "recent activity" feed — a PURE display projection. (Step 2)
 *
 * The Account feed is a UNION of two axes that are kept separate in the model: the MONEY axis
 * (`Customer360.activity`, from the charging seam — top-ups/refills/adjustments) and the
 * RELATIONSHIP axis (`Customer360.interactions`, TMF683 from CPR — onboarding/plan-change/support).
 * `activityFeed` flattens both onto this one shape so the UI renders a single list and never touches
 * either raw source. Keeping `source` means the UI can still pick the right icon/label per axis.
 */
export interface FeedItem {
  /** Unique across both sources (`money:<activityId>` / `rel:<interactionId>`), so React keys don't collide. */
  feedId: string;
  /** Which axis this row came from — drives the icon/label family in the UI. */
  source: "money" | "relationship";
  /**
   * What happened. Money kinds are financial (`topUp`/`refill`/`adjustment`); relationship kinds are
   * lifecycle moments (`onboarding`/`planChange`/`support`). `topUp` appears in both unions on purpose
   * — a money top-up vs. a (future) recorded top-up interaction — disambiguated by `source`.
   */
  kind: ActivityItem["kind"] | PartyInteraction["type"];
  /** ISO timestamp the event occurred — the merge/sort key (newest first). */
  occurredAt: string;
  /** Outcome, normalized across sources, so a failed/pending row reads as such (colour + word). */
  status: "completed" | "pending" | "failed";
  /** Signed minor units for a money row (+ credit / − debit). Absent for a relationship row or an unpriced refill. */
  amountMinor?: number;
  currency?: "EUR";
  /** For a money refill: the offer bought, for the label. Absent otherwise. */
  offerName?: string;
}

/**
 * Normalize a TMF683 interaction status onto the feed's three-state outcome. `inProgress` → pending.
 */
function interactionStatus(s: PartyInteraction["status"]): FeedItem["status"] {
  return s === "inProgress" ? "pending" : s;
}

/**
 * How many recent-activity rows the feed shows. A prepaid line accrues top-ups/refills/interactions
 * indefinitely; without a cap the Account screen would materialise and render a customer's ENTIRE
 * financial + relationship history at once. 20 is a "recent activity" window, not a ledger.
 *
 * ⚠️ FASE 8: this is a DISPLAY cap on an already-fetched list — the mock returns everything. When a
 * real backend lands, the limit belongs on the READ (a `limit`/pagination param on charging
 * getActivity + cpr listInteractions) so the full history never crosses the wire. This constant
 * then becomes the page size, and the feed gains "show more". Capping here is the honest interim:
 * it bounds the render today without pretending the fetch is paginated.
 */
export const ACTIVITY_FEED_MAX = 20;

/**
 * The merged recent-activity feed — a PURE rule, no I/O, no throw. (Step 2)
 *
 * Unions the money feed (`c360.activity`) and the relationship timeline (`c360.interactions`) into
 * one list of `FeedItem`, newest first, capped at ACTIVITY_FEED_MAX. Both sub-sources are already
 * individually newest-first from `composeCustomer360`, but they must be re-sorted together once
 * interleaved. The UI reads THIS, not the raw axes — so when a connector starts recording new
 * interaction or transaction kinds, the feed grows with no UI change.
 *
 * No de-duplication today: the only interaction recorded is `onboarding`, which never coincides with
 * a money row. If a `topUp`/`planChange` interaction ever lands that mirrors a money transaction,
 * add a prefer-money-row rule here (same instant + same kind) — not before it can actually happen.
 */
export function activityFeed(c360: Customer360): FeedItem[] {
  const money: FeedItem[] = c360.activity.map((a) => ({
    feedId: `money:${a.activityId}`,
    source: "money",
    kind: a.kind,
    occurredAt: a.occurredAt,
    status: a.status,
    ...(a.amountMinor !== undefined ? { amountMinor: a.amountMinor } : {}),
    ...(a.currency !== undefined ? { currency: a.currency } : {}),
    ...(a.offerName !== undefined ? { offerName: a.offerName } : {}),
  }));
  const relationship: FeedItem[] = c360.interactions.map((it) => ({
    feedId: `rel:${it.interactionId}`,
    source: "relationship",
    kind: it.type,
    occurredAt: it.occurredAt,
    status: interactionStatus(it.status),
  }));
  // Sort first, THEN cap — so the cap keeps the newest rows across both sources, not whichever
  // source happened to be concatenated first.
  return [...money, ...relationship]
    .sort(byOccurredAtDesc((f) => f.feedId))
    .slice(0, ACTIVITY_FEED_MAX);
}
