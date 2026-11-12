# Design review — Usage/allowance buckets in Customer 360 (plan, TMF654 mock)

Reviewed: `docs/design/2025-02-17-usage-allowance-buckets-plan.md` (the plan)
Against: `docs/research/prepaid-usage-buckets-and-low-balance-warnings.md` (research), `design/DESIGN.md` (ruler, found via the repo — the active ruler for this project), and the real code the plan modifies: `src/services/model.ts`, `src/services/customer360-rules.ts`, `src/services/charging/charging-driver.ts`, `src/locales/en.json`.

This reviews the plan's **design decisions**. There is no code yet. TMF635 usage history and real metering are declared out of scope — not flagged.

---

## Promessa da tela

This change builds no screen — but it is not promise-free. `src/locales/en.json` already ships the Home promise: *"Your balance and usage summary will appear here soon."* The model being planned here is the thing that must eventually pay off that sentence. So the real test of the model is not "is it a clean TMF654 shape" — it is **"can a number-first usage card and a low-balance warning be rendered from this and nothing else, with no second server round-trip and no logic smuggled into the component?"** That is the lens below.

## O que está resolvido

Five decisions are right and should not be reopened:

1. **Two axes kept separate.** Money stays in `Balance` (minor units); usage goes in a new `UsageBucket[]`. The research and the dossiê both insist on it, and the existing `Balance` already models money-with-`validUntil` — usage is genuinely a different axis, not a variant of balance. Correct.
2. **Pure `bucketState` rule, threshold in one place.** Putting the state in a tested pure function next to `composeCustomer360` (both are pure, no I/O, never throw) matches the existing `customer360-rules.ts` discipline exactly. The UI warning and any future notification reading the same states is the right instinct.
3. **Unlimited-as-word, no remaining number.** Matches the research (Cash App) and matches the existing `Offer.unlimitedData` + `dataAmount: "Unlimited"` label precedent in `model.ts`. Consistent.
4. **Decimal units (plan-advertised base), MB canonical.** Directly answers the research's one real units conflict (binary vs decimal drift). Correct and worth keeping as a comment in the type.
5. **Graceful degrade to `usage: []`.** Same discipline as `balance`/`interactions`/`installedBase` already use in `composeCustomer360`. The 360 renders if ECEV usage fails. Correct — don't add a loading-failed sentinel to the array.

---

## Achados

### Bloqueia entrega

- **The model can't produce the announced string without the UI re-deriving state — the research's own headline requirement.** The research is explicit: the bucket is announced to a screen reader as **text that already states the warning** — *"2.3 GB of 10 GB left, running low"* — because a bare `progressbar` does not announce on change (SC 4.1.3 / ARIA). The plan's model carries `remainingUnits`, `totalUnits`, `unit` and a separate `bucketState()` function. To build that one sentence the component must: call `bucketState()`, map `"low"`→the word "running low", format MB→GB at 3 sig-figs, and assemble. That is display logic living in the component — exactly what the "threshold in one place" decision was trying to prevent, reappearing one layer up. → **The model (or a sibling pure rule) must expose the state *with* the bucket, not as a function the component is trusted to call.** Add `state: BucketState` onto the composed bucket in `composeCustomer360` (compute once, like the installed-base join), OR ship a `describeBucket(bucket, now, t) → { valueText, stateWord, state }` pure rule alongside `bucketState`. Without this, every consumer (card, future notification, aria-live region) re-implements the same mapping and they *will* drift. This is the money-axis analogue of why `FirstTopUp` carries `state` as a field rather than making the UI infer it from timestamps.

- **A money-numbered meter with no "last known / as-of" marker is the prepaid "faz errado e não percebe".** The plan says the mock's remaining values are **static per session** — a top-up or usage event does not decrement the bucket. That is fine for a mock. What is *not* fine is a model with no field that lets the UI say *when* the number was measured. On a real prepaid line the remaining-data number is the single most time-sensitive fact on the screen, and the research (Microsoft guidance) calls out "show last updated" as core. A user who sees "2.3 GB left", uses an app, returns, and still sees "2.3 GB left" cannot tell the stale number from a fresh one. → Add an optional `asOf?: string` (ISO) to `UsageBucket`. The ruler's rule "every monetary value states its nature" has a direct usage analogue here: **every metered value states its freshness.** Cheap now, impossible to retrofit cleanly once screens depend on the shape. (Not a blocker *for the mock rendering*, but a blocker for the model being right — and the model is the whole deliverable.)

- **`low` divides by `totalUnits` without a stated guard; "not yet granted" has no state.** `remainingUnits / totalUnits <= 0.20` is undefined/NaN when `totalUnits` is `0` or absent on a metered bucket. The research explicitly raises the "not yet granted" case (Cash App renders it as "0/10 GB", *not* hidden, and *not* "depleted"). A freshly granted bucket with `remaining === total` is `ok` and fine — but a bucket provisioned with `total = 0` pending fulfilment, or `remaining > 0, total = 0`, falls through to a divide-by-zero and then to `ok`, which reads as "all good" on a bucket that isn't usable yet. → Decide and encode: either guarantee `totalUnits > 0` for every metered bucket at the seam (document the invariant), or add an explicit `pending` state for not-yet-granted. Given the research names it, I lean `pending`. See item 4 below.

### Vale corrigir

- **Threshold: ship a single `low` at 20%, do NOT put a tiered `notice(50%)` in the model now.** (Full recommendation in §"Threshold" below.) This is "vale corrigir" only in that the plan asks the question and leaves it open — the answer is: resolve it as single-threshold, and record why, so it doesn't get reopened.

- **No display label / type label in the model.** The card needs a human string per bucket ("Data", "Calls", "Texts", "Roaming data"). The plan has `type` (enum) and `offerName` but no label. The ruler mandates i18n keys and zero hardcoded strings, so the label must be a locale key, not English in the model — correct — but the model should make the mapping explicit (a documented `type → i18n key` convention the card and the aria-string share) rather than leaving each consumer to invent `t('usage.type.' + bucket.type)`. Pair it with the `describeBucket` rule above.

- **`offerName` is a dead-end string where the research wants a link.** The research's depleted-recovery requirement is "out of data → add-on/upgrade; out of money → top up", and C360_011 asks "what granted it". `offerName` as a bare string tells the user the name but gives the UI nothing to route on. The installed-base model already joins products to offers by `offerId`. → Carry `offerId?: string` (the thing that granted the bucket) alongside/instead of the display `offerName`, so the depleted card's recovery action can deep-link to the right add-on/plan rather than dropping the user on a generic Top-up. Keep `offerName` only if it's needed for display when the offer isn't in the catalogue (same fallback shape as `EnrichedProduct.offer ?? name`).

- **Validity is one field doing two jobs; the research says they're distinct.** The comment says `validUntil` is "Expiry / reset". But the research (via the Google Data Plan API categories) separates **`EXPIRED`** (a one-time allowance that is gone) from a **cyclic reset** ("resets in 12 days"). A one-time data add-on that expires is a *depleted-and-gone* story (recovery = buy again); a monthly bucket that resets is a *wait or top-up* story. Same ISO date, opposite meaning and opposite recovery copy. → Add a boolean discriminator, e.g. `renews: boolean` (or `validityKind: "expiry" | "reset"`). Without it the UI cannot choose between "Expired — buy an add-on" and "Resets in 12 days" and will have to guess from `offer.autoRenew`, which isn't on the bucket. The `Offer.autoRenew` field already exists as precedent that this product models renew-vs-not.

### Refinamento (preferência declarada)

- *Preference:* `type` as a closed union `"data"|"voice"|"sms"|"roaming"` — "roaming" is a *data* bucket semantically (it has MB), so an app that later adds "roaming voice" will strain the enum. Not worth solving now; just noting the enum conflates "what's metered" with "where". Leave as-is for the base case.
- *Preference:* consider `remainingUnits`/`totalUnits` staying plain numbers (the plan's open Q2) — yes, plain numbers are enough (see §Q2). This is a preference against over-modelling, and I agree with the plan.

---

## Acessibilidade — WCAG 2.2 AA

The plan's a11y section is unusually good for a plan (it already names 1.4.1, 1.4.11, aria-live, text-first). The gaps are specific to a **usage meter** and to whether the *model* can feed the a11y UI.

| Critério | O que está no plano / o que falta | Correção | Aparece num ACR? |
|---|---|---|---|
| **4.1.3 Status Messages** | Plan says "aria-live when a bucket crosses into low/depleted". Correct trigger. But in a mock where values are static per session, a bucket never *crosses* — so the live region must also handle the **on-load** announcement for a bucket that is *already* low/depleted, not only transitions. | Announce current state politely on first render of the card for already-low/depleted buckets; use `aria-live="polite"`, not `assertive` (a usage warning is not an interruption). Model must expose the state as a field so the region has a string to read (see blocker 1). | **Yes** — EN 301 549 / RFP. |
| **1.4.11 Non-text Contrast** | Plan says any bar/meter ≥3:1. Correct. The ruler's `accent` (Drei cyan #0096c5) is ~3.3:1 on white — passes 3:1 as a graphic. But a **bar fill vs its track** must *also* be ≥3:1 against each other, not just each against white. | Bar fill = `accent`, track = a tint that is ≥3:1 from the fill — not `accent-tint` (#e0f3fa, far too close to white and to cyan). Verify fill-vs-track with `tools/contrast.py`. For `low`/`depleted`, the fill switches to `warning`/`danger` (a state, per ruler "status owns amber/red") — which also keeps colour from being the only signal since the word changes too. | **Yes.** |
| **1.4.1 Use of Color** | Plan says icon + text + colour. Correct and matches the ruler's "status = colour + word". | Keep. The *word* must come from the state (blocker 1) so icon, text and colour can't desync. | Yes. |
| **1.3.1 Info & Relationships** | Not addressed. A usage card is a labelled group (label + value + optional meter + validity). | Associate the value and meter with the bucket label (`aria-labelledby`); if a `progressbar` is drawn give it `aria-valuenow/min/max` *and* an accessible name — but the research is right that the text, not the progressbar, carries the warning. | Yes. |
| **1.4.10 Reflow** | Not addressed; relevant because 390px is the only width and a usage card with label + "X of Y" + validity + a meter is horizontally busy. | Design the card to stack at 320px (400% zoom) with no horizontal scroll. A model concern only insofar as the value string must be short enough — reinforces 3-sig-fig formatting. | Yes. |
| **2.5.8 Target Size** | Only relevant once the card has a tap target (the recovery action / deep-link). | The depleted "Add data"/"Top up" action is a 52px button per the ruler — fine. Noting for the UI change, not this one. | — |

**How "2.3 GB of 10 GB left, running low" should be announced, and can the model generate it?**

Announcement wording (polite live region, one string):
> `"Data: 2.3 GB of 10 GB left, running low."`

For depleted and expired, the research's "what + how to recover" shape:
> `"Data: 0 GB left, out of data. Add data to keep browsing."`
> `"Data: expired on 7 March. Buy an add-on to continue."`

**Can the model generate it today? No — and that's blocker 1.** The sentence needs four things the model only partly carries:
- `"2.3 GB of 10 GB"` — derivable from `remainingUnits`/`totalUnits`/`unit` **but only via a formatter the model doesn't specify** (MB→GB, 3 sig-figs). Put that formatter in the pure rule, not the component.
- `"Data:"` — the type label (missing, see "no display label").
- `"running low"` — the state word (the state is computed by a function the component must remember to call; make it a field).
- `"Add data" / "Buy an add-on"` — recovery copy that depends on **reset-vs-expiry** (missing, see validity finding) and on **out-of-data vs out-of-money** (that split is correct in the plan — it lives across the two axes, good).

So the model *as planned* forces the string to be assembled in the component from four sources, three of which are implicit. Make it a pure `describeBucket(...)` that returns the display value, the state, the state word key, and the recovery-action target. Then the card, the aria-live region, and any future push notification read one source and cannot diverge.

---

## Estados faltando

The state model is `ok | low | depleted | expired`. For a real prepaid dashboard it is missing two, and has one questionable rule:

- **`pending` / not-yet-granted** — the research names it (Cash App "0/10 GB"). A bucket provisioned but not active (mid-fulfilment, or a scheduled future allowance) is neither `ok` nor `depleted`. Today it would divide-by-zero or read as `ok`. **Add it**, or guarantee the invariant that no `pending` bucket is ever composed into the 360 (and document which). Given onboarding can be mid-flight, `pending` is realistic.
- **Unlimited-with-fair-use throttle** — the plan hard-codes "unlimited buckets are always `ok`". The research flags exactly this as an open hypothesis: an unlimited plan with a fair-use/throttle cap may still want a secondary indicator. **For the base case, "unlimited always ok" is the right call** — don't model a throttle state speculatively (the research found no evidence either way, and `Offer.unlimitedData` carries no throttle today). But write the decision down as deliberate, so a future throttled plan is a known model change, not a surprise. *Nit, not a blocker.*
- **Money axis vs usage axis — correctly separate.** `depleted` here means out-of-*data*; out-of-*money* stays `Balance.amountMinor === 0` on the other axis. The plan keeps them apart and gives them different recovery paths (add-on vs top-up). This is right and is one of the plan's strengths. The only risk is a future `bucketState` creeping a money check in — don't.

The five operational states the ruler's sibling screens worry about (obsolete / conflict / partially-applied / expired / awaiting-third-party) mostly don't apply to a read-only usage view — **except "obsolete"**, which is precisely the `asOf` blocker above: a usage number *is* the obsolete-prone value here.

## Carga — o que perguntei e o que ficou sem resposta

- **How many buckets per customer, worst case?** The plan seeds 4 (data/voice/sms/roaming). Real prepaid with add-ons can reach ~8–12 (base data + bonus data + weekend data + roaming pack + …). A 390px card list of 10 meters is a different design from 4. The model is a flat array — fine — but the *UI change* must state the point at which the list needs grouping/collapse. Not a blocker for this data-only change; flag it into the UI change's scope.
- **Server cost of `getUsage`?** Added to the parallel fan-out in `getCustomer360` — good, it won't serialize behind balance. No per-bucket round-trips. Fine.
- **Concurrency / staleness?** Covered by the `asOf` blocker.

## Papéis

Single role for this PWA: the **prepaid account holder**, self-service, read-only on usage. No CSR/admin view consumes `Customer360.usage` in scope. No role-gated fields on the bucket. Nothing to split. (The model comment notes a CSR panel reuses `PartyInteraction`; usage isn't claimed for it here, which is fine.)

## Aderência ao sistema

Measured against the ruler found in the repo (`design/DESIGN.md`) — the active ruler for this project.

- **"Status = colour + word", status owns success/warning/danger** — the plan's icon+text+colour and state-driven fill comply, *provided* the word is driven by the state field (blocker 1). ✅ with the fix.
- **Number-first, "the only big thing is the number that matters"** — the plan's "number-first, bar secondary" is a direct match to `display-number` + the ruler's hierarchy. ✅
- **`tabular-nums` for numbers that mean data/time** — the ruler requires it; the UI change must apply it to "2.3 GB of 10 GB". Model-neutral, noted for the UI. ✅ (flagged)
- **Zero hardcoded strings / i18n keys** — the "no display label" finding enforces this: type labels, state words and recovery copy must all be keys. ✅ with the fix.
- **Campaign colours never signal state; accent is not a state** — a usage meter must use `warning`/`danger` for low/depleted, never `accent` cyan and never campaign purple/lime. The plan doesn't violate this but the UI change must not "brand" the meter with accent for low state. Note it. ✅ (flagged)
- **One primary per screen** — the depleted recovery action (Add data / Top up) is the candidate primary on the eventual card; only relevant in the UI change. Noted.

No divergence from the ruler in the plan itself. The ruler was found in the repo and is the right one; no competing `DESIGN.md` was adopted.

## Escrita — antes → depois

Strings the plan implies the UI will need. All en-US, sentence case, one term per concept (the ruler fixes "Top up" for money credit; use "Add data" for the usage-add-on path so the two recovery paths read differently — which is the research's out-of-data vs out-of-money split, made legible in copy).

| Onde | Está (en) | Proposta (en) | Por quê |
|---|---|---|---|
| Usage value, metered | (plan: "2.3 GB of 10 GB left") | `2.3 GB of 10 GB left` | Keep — number-first, "left" (remaining-framed) per research hypothesis. ✅ |
| Low state word | (implied by `low`) | `Running low` | Sentence case; the word that pairs with amber + icon. |
| Depleted, data | — | `Out of data` + action `Add data` | Research depleted shape; "Add data" ≠ "Top up" so the axis is legible. |
| Depleted, money (other axis) | existing `balanceEmpty` | `Out of balance` + action `Top up` | Keep ruler's "Top up" term for money. |
| Unlimited value slot | (plan: the word) | `Unlimited` | Matches `Offer.dataAmount: "Unlimited"` precedent. |
| Validity, reset | — | `Resets in 12 days` | Relative near-term (research). Needs the `renews` discriminator. |
| Validity, expiry | — | `Expires 7 Mar` → when past: `Expired 7 Mar` | Absolute anchor; one-time allowance. Needs the discriminator. |
| Type labels | — | `Data` / `Calls` / `Texts` / `Roaming data` | i18n keys; "Calls"/"Texts" read better than "Voice"/"SMS" for a consumer (Cash App uses "Calls/texts"). |
| As-of marker | — | `Updated just now` / `Updated 5 min ago` | The freshness statement (blocker 2). |

New term for `docs/glossario-en.md` — **only the ones I can define from the repo**:
- **Add data** — a usage-recovery action that buys a data add-on to extend a depleted/low *data* allowance; distinct from **Top up**, which credits the *money* balance. (Confirmed against the two-axis split in the plan + `Balance`/`Offer` in `model.ts`.)

*Proposed, not yet confirmed — do NOT add to the glossary until confirmed:* whether "Roaming data" vs "Roaming" is the shipping label, and whether "Calls/texts" is combined into one bucket row (Cash App) or kept as two (`voice` + `sms` separate in the plan). These are UI-change decisions.

## Preciso saber antes

- **Does a bucket's remaining value ever change within a session in the real driver (Fase 8), or only on reload?** If it can change live, blocker 1's live-region and blocker 2's `asOf` are both load-bearing; if it's reload-only even in prod, `asOf` still matters but the live region only fires on navigation. *Suspends:* the exact aria-live trigger wording, not the need for the field.
- **Is there a scheduled/future-dated allowance (a bucket that becomes active later)?** *Suspends:* whether `pending` is a required state or an invariant to forbid (item 4 / blocker 3).
- **Will the depleted recovery action deep-link to a specific offer, or to a generic Add-ons tab?** *Suspends:* whether `offerId` on the bucket is required now or deferrable (vale-corrigir "dead-end string").

## Limites desta revisão

- **No visual verification.** This is a plan with no screen and no rendered UI; I reviewed the model and the described UI against the research and ruler. No contact sheet exists to diff (I don't run the app or capture screens). When the UI change lands, it needs a `ui-capture` pass — especially the fill-vs-track 3:1 and the 320px reflow, which I could only reason about, not measure.
- **Contrast ratios** for the meter fill/track are reasoned from the ruler's hand-computed table; they carry the ruler's own "reconfirm with `tools/contrast.py`" caveat.
- **No prior review round of *this* plan exists** (checked `docs/design/` — this is the first pass on usage buckets), so there is no regression to diff against. Sibling reviews (Fase 7 plan/visual) were consulted only for house style.
- TMF635 history and real metering are out of scope by declaration — not evaluated, correctly.
