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
