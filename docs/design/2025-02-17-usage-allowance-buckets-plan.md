# Plan — Usage / allowance buckets in Customer 360 (TMF654, mock)

> STATUS: plan for review (no code yet). Source of truth for the design decisions: the research
> synthesis `docs/research/prepaid-usage-buckets-and-low-balance-warnings.md` (carrier practice +
> WCAG 2.2 + Mobbin), the dossiê 360 requirements (C360_011/012, SREQ_00223 — buckets with total
> vs available, expiry, offer name, and a low-balance warning), and the current seam/mock
> architecture. This continues the enriched-360 work (after Party Interaction + ECM enrichment).

## Goal

Add non-monetary **usage/allowance buckets** (data, voice, SMS, roaming) to the Customer 360 so the
logged area can show "what's left on my plan", driven by the charging seam (ECEV / TMF654). This is
a **backend + model + composition** change only — the dashboard UI that consumes it is a separate,
later change. Data flows into the 360; nothing renders yet.

## Why this is a new addition (not already covered)

The 360 today carries a **monetary** `Balance` (TMF654 billing-account: amountMinor, currency,
validUntil) — money. It carries **no non-monetary allowance** — the data/voice/SMS a prepaid line
actually consumes. The research and the dossiê both insist these are **two distinct axes**: "usage
measurement (MB, seconds) vs monetary ledger (how much you owe)". A real dashboard needs both.

## Model

```ts
/** A non-monetary allowance bucket (TMF654 "Prepay Balance Management" product bucket). */
export interface UsageBucket {
  bucketId: string;
  /** All the prepaid bucket kinds the 360 may show (C360_011). Extensible. */
  type: "data" | "voice" | "sms" | "roaming";
  /** Unlimited buckets have no meaningful remaining number (Cash App "Unlimited" pattern). */
  unlimited: boolean;
  /** Granted total, in `unit`. Absent when unlimited. */
  totalUnits?: number;
  /** Available remaining, in `unit`. Absent when unlimited. */
  remainingUnits?: number;
  /** Unit of measure for formatting (MB for data, min for voice, sms count). */
  unit: "MB" | "min" | "sms";
  /** Expiry / reset (ISO). Shown relative near-term + absolute renewal date. */
  validUntil?: string;
  /** Which offer granted this bucket (C360_011 "offer name"). */
  offerName?: string;
}
```

`Customer360` gains `usage: UsageBucket[]`. The existing money `Balance` stays as-is — money axis
and usage axis are kept separate (research + dossiê).

### Units: decimal, as the plan is sold

Compute/display data in the **base the plan is advertised in** (decimal, "10 GB" = 10000 MB), not
binary, so the number never drifts from the advertised allowance (research conflict note). Store MB
as the canonical data unit; format to GB at display with ~3 significant digits.

## Pure rule — the tiered state (the item-2 question, now research-backed)

```ts
export type BucketState = "ok" | "low" | "depleted" | "expired";
export function bucketState(bucket: UsageBucket, now?: Date): BucketState;
```

- **expired** — `validUntil` is in the past (checked first).
- **depleted** — metered and `remainingUnits === 0`.
- **low** — metered and `remainingUnits / totalUnits <= 0.20` (**≤20% remaining / 80% consumed**).
- **ok** — otherwise. **Unlimited buckets are always `ok`** (nothing to run low).

Default threshold **20% remaining / 80% consumed**, from the research: carrier practice (CREDO
75%+100%, Android/third-party ~80%) + the Google Mobile Data Plan API categories
(`LOW_QUOTA → OUT_OF_DATA`). Honest caveat: there is **no GSMA/ITU normative %**; this is a
defensible default, not a regulation. The threshold lives in the pure rule (testable, one place),
not hardcoded in a component — so the UI warning and any future notification share the same states.

## ECEV seam

- `getUsage(customerId) → UsageBucket[]` — TMF654 "get bucket" read. Added to `ChargingDriver`
  interface, mock, and http stub (`notConfigured`), tenant via SeamContext, never-throw SeamResult.
- Mock seeds buckets for the demo customer **correlated with its plan**: a metered data bucket, a
  voice bucket, an SMS bucket, and a roaming bucket — mixing metered and one **unlimited** so both
  render paths are exercised. One seeded bucket deliberately near the low threshold so the warning
  state is demonstrable.

## Composition

`composeCustomer360` takes `usage?: UsageBucket[]`, passes it through onto `Customer360.usage`
(ordered deterministically by type: data, voice, sms, roaming). `getCustomer360` fan-out adds
`getUsage(customerId)` to the parallel reads; **degrades gracefully** — if ECEV usage fails,
`usage: []` and the 360 still renders (same discipline as installedBase / balance / interactions).

## The future dashboard UI (documented now so the model serves it; NOT built in this change)

From the research + Mobbin (Cash App, Saily, N26, Airalo, Ahead):

- **Number-first**: "Data — 2.3 GB of 10 GB left" is the primary fact; a determinate bar/ring is
  **secondary reinforcement** only.
- **WCAG 2.2**: low/depleted conveyed by **icon + text + color**, never color alone (SC 1.4.1);
  any bar/meter at **≥3:1 non-text contrast** (SC 1.4.11); the warning state announced as **text**
  (a bare `role=progressbar` does not auto-announce) — via an `aria-live` status region when a
  bucket crosses into low/depleted.
- **Unlimited** → the word in the value slot, no bar, no remaining number.
- **Validity** → relative near-term ("resets in 12 days") + absolute renewal date as the anchor.
- **Two depleted recovery paths, kept distinct**: out of data → add-on/upgrade; out of balance
  (money) → top up (the N26 "insufficient balance" vs Saily "Add data" split).

## Scope boundaries / conscious debt

- Mock only; real TMF654 ECEV is the http driver (Fase 8). No real metering — the mock's remaining
  values are static per session (a top-up/usage event does not decrement a data bucket yet).
- **Usage history** (TMF635) — a transactions/consumption list — is NOT in scope; only current
  bucket balances.
- The dashboard UI (Home/My plan) is a **separate change**; this one stops at data-in-the-360.
- No notifications/thresholds-as-alerts; the `bucketState` rule only drives UI state for now.

## Open questions for the review

1. Threshold: is **20% remaining** the right single default, or should the model carry a tiered
   `low` (20%) + an earlier `notice` (50%)? The research says the band is agreed, the exact cutoff
   isn't standardized.
2. `remainingUnits`/`totalUnits` as plain numbers in `unit` (MB/min/sms) vs a richer money-style
   `{ value, unit }`. Plan proposes plain numbers for simplicity; is that enough for formatting?
3. Is a `roaming` bucket worth seeding in the base-case demo (US, no identity), or defer roaming
   until it's actually needed?
4. Should `bucketState` live with the other pure rules (`customer360-rules.ts`) or its own file?

---

## As-built addendum (shipped) — supersedes the plan body where they differ

> STATUS: implemented and merged. Commits: `39fce8c` (model + compose), `83c2e8b` (bucketState),
> `f0c1eb4` (ECEV seam + stateful mock + add-on refill), `9eea77f` (compose into getCustomer360).
> The sections above are the pre-build plan; where this addendum differs, the addendum is correct.
> The two review rounds that fed these changes: `...plan-review.md`, `...plan-review-r2.md`.

### What changed from the plan (and why)

1. **Quantity shape: `{ value, unit }`, not plain `totalUnits`/`remainingUnits` + a sibling `unit`.**
   Shipped `UsageQuantity { value: number; unit: UsageUnit }`, with `total?` / `remaining?` of that
   type on `UsageBucket`. Mirrors the money axis's `{ amountMinor, currency }` and TMF654's
   `{ amount, units }`, so a real connector maps straight in. (Open question #2 → richer shape.)

2. **Data unit is `GB`, not `MB`.** `UsageUnit = "GB" | "min" | "sms"`. The plan proposed MB as the
   canonical unit; the live DMP TMF654 payload (Glean: `remainingValue[].units: "GB"`) **and** the
   catalogue (`Offer.dataAmount` is "10 GB") both speak GB, so storing MB would force a conversion
   on the way in — the exact reshaping we wanted to avoid. Decimal (as sold) is preserved; the unit
   label is just GB. Found in the Task #1 review before any value was seeded (zero migration cost).

3. **Validity is a RANGE `validFor { start?, end? }`, not a single `validUntil`.** TMF654 `validFor`.
   This makes a **`pending`** bucket representable (a future-dated add-on, `start` in the future),
   which the plan's single `validUntil` could not express.

4. **State machine gained `pending`; order is a priority ladder.** Shipped
   `BucketState = "ok" | "low" | "depleted" | "expired" | "pending"`, evaluated first-match:
   `expired` (end past) → `pending` (start future) → unlimited ⇒ `ok` → `depleted` (remaining ≤ 0)
   → `low` (remaining ≤ `LOW_REMAINING_RATIO`·total) → `ok`. Validity is checked **before** quantity
   on purpose (a lapsed/future bucket reads as such even if its numbers look healthy or empty).
   `LOW_REMAINING_RATIO = 0.2` is a named, exported constant; the **50% notice tier was deferred**
   (open question #1 → single threshold for now). Guards: unknown `remaining` → `ok` (don't invent a
   warning); no/zero `total` → can't form a ratio → `ok`. `now` is injectable for deterministic tests.

5. **`offerId` correlation added beside `offerName`.** `UsageBucket.offerId` = DMP's
   `productOfferingId` join key (confirmed against DMP Evolved docs: `contract[].product[].productBucket[]`
   correlates on `productOfferingId`). This is the real-catalogue integration seam — not an allowance
   field on the plan Offer. **The plan `Offer` was left untouched**; the catalogue decision was the
   minimal `offerId`-correlation option precisely because it maps 1:1 onto the real catalog later
   (the real catalogue models allowances as separate **Benefit POs**, not fields on the plan).

### Answers to the plan's open questions

1. **Threshold** → single `LOW_REMAINING_RATIO = 0.2`; 50% notice tier deferred until a product need.
2. **Quantity shape** → richer `{ value, unit }` (see change #1).
3. **Roaming bucket in the base demo** → **yes, seeded.** All four types (data/voice/sms/roaming)
   are seeded so both the composer ordering and all render paths are demonstrable.
4. **Where `bucketState` lives** → with the other pure rules in `customer360-rules.ts`.

### Recharge / add-on consistency (not in the original plan; added per user requirement)

The mock is **stateful** and actions move the numbers:
- **Top-up** moves the **money axis only** (decision **A1**) — credit is not allowance.
- **Add-on purchase** moves the **usage axis**: `purchaseAddOn(customerId, offer)` calls
  `grantAllowance` after `submitOrder` (decision **B1** — client-side orchestration, the two mocks
  stay decoupled). `allowanceGrantForAddOn(offer)` derives the grant: `euRoaming`→roaming, else→data;
  unlimited add-on→unlimited grant; unparseable label (e.g. streaming pass)→`null` (entitlement-only,
  no bucket fabricated). Refill rule: same `offerId` ⇒ top up (total + remaining both grow); else a
  new bucket. Mirrors real DMP (order fulfilment → CBEV creates the product bucket); the grant step
  is **deleted, not unwound**, when the real ECEV http driver lands.
- `getUsage`/`grantAllowance` return deep-ish copies so a caller can't mutate the mock's stored
  state through nested `total`/`remaining`/`validFor` (hardened in the Task #3 review).

### Still deferred (conscious debt, unchanged)

- The **dashboard UI** that renders `Customer360.usage` — being planned next, from the Figma prototype.
- Real TMF654 ECEV (http driver), usage history (TMF635), notifications/threshold alerts.
- **Pre-existing flaky test** observed during this work: `cpr.functions.test.ts > ... records an
  onboarding interaction ... newest-first` failed once in a full-suite run, passed in isolation and
  on re-run. Not introduced by this work (timestamp nondeterminism in the interaction sort seed).
  Fix later by injecting a clock or using distinct `occurredAt` values in that test's seed.
