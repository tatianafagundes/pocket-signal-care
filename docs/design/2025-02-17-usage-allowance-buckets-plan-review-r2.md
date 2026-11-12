# Design review r2 — Usage/allowance buckets plan: scope, states, meter a11y, content, verdict

Reviewed: `docs/design/2025-02-17-usage-allowance-buckets-plan.md` (the plan).
Builds on — does **not** repeat — two prior audits:
- `docs/research/usage-allowance-buckets-plan-faithfulness-check.md` (the faithfulness audit: 3 must-fixes — `validFrom`/`validFor`; stable `offerId`/product ref beside `offerName`; 20% as a named constant with the 50% tier deferred explicitly; plus "unlimited always ok" flagged as a non-research default).
- `docs/design/2025-02-17-usage-allowance-buckets-plan-review.md` (the prior design review: `describeBucket`/state-as-a-field blocker, `asOf` freshness blocker, divide-by-zero + `pending`, `renews` discriminator, `offerId` dead-end-string, label i18n, the a11y table).

**Take all of the above as given.** This round answers the five questions the prior rounds did not frame: (1) is deferring *all* dashboard UI the right scope cut; (2) is `ok/low/depleted/expired` the complete state set a user must distinguish; (3) the a11y of a *meter* specifically — `progressbar` vs text + decorative bar; (4) content framing — "X of Y left" vs "X used", relative+absolute validity, unlimited; (5) a recommendation for each of the plan's 4 open questions and a build-now-or-design-first verdict.

Grounded against the real code the plan modifies: `src/services/model.ts`, `src/services/customer360-rules.ts`, `design/DESIGN.md` (the active ruler, found in-repo).

TMF635 usage history and real metering are out of scope by declaration — not flagged. Mock-faithful to TMF654 — absent real metering is not a finding.

---

## Promessa da tela

This change renders nothing, but it is not promise-free: `en.json` already ships the Home promise *"Your balance and usage summary will appear here soon."* The model is the thing that must pay that sentence off. So the test applied here is the prior review's test, carried one step further: **not "is this a clean TMF654 shape" but "could a competent engineer build the number-first card, the four distinct depleted/expired/low/unlimited renderings, and the screen-reader announcement from this model and nothing else — without a second server round-trip and without re-deriving state in the component?"** The five questions below are all facets of that one test.

## O que está resolvido (não reabrir)

The prior review's five "resolved" items stand (two axes separate; pure `bucketState`; unlimited-as-word; decimal/MB-canonical; graceful degrade to `usage: []`). I add two the prior round did not call out, because they bear on the questions below:

1. **The money/usage split is the thing that makes Q2 answerable.** Keeping `Balance.amountMinor` (money) apart from `usage[]` (allowance) is not just tidy — it is *the* mechanism by which "out of data" and "out of money" render as two different states with two different recovery actions. Confirmed against the code: `hasBalance()` already reads `amountMinor > 0`, so "out of money" has a home on the money axis today. The usage axis's `depleted` must mean out-of-*data* only and never read the balance. (Expanded in Q2.)
2. **`FirstTopUp` is the precedent that settles the "state as a field" argument.** The real model already ships a value-with-state-as-a-field: `FirstTopUp.state` is a union carried *on the object*, not inferred by the UI from `authorizedAt`/`capturedAt`/`creditedAt` timestamps. The prior review's blocker 1 ("expose state with the bucket, not as a function the component calls") is therefore not a new invention — it is the house pattern, and the bucket diverging from it would be the anomaly.

---

## Q1 — Is deferring ALL dashboard UI the right scope cut?

**Verdict: the backend/model/compose split is the right cut. Deferring the *rendered, shippable* screen is correct. But "design zero real screen" is not what should be deferred — one bucket row, drawn to the level of its states, must exist now, or the model is being specified against an imagined consumer.**

Why the cut itself is right: the repo's whole discipline is seam → pure compose → screen, and `composeCustomer360` is already the place derived facts are computed once (the `offer` join). Adding `getUsage` to the parallel fan-out and composing `usage[]` is a self-contained, testable, degradable change that matches installed-base/balance/interactions exactly. Shipping it without the screen is normal here and low-risk.

Why "zero screen" is **not** right, and is in fact the risk the orchestrator names: every blocker the prior review found — state-as-a-field, `asOf`, divide-by-zero/`pending`, `renews`-vs-expiry, `offerId` for the recovery deep-link — was found *by trying to draw the sentence and the recovery action against the model*. None of them is visible from the TMF654 shape alone. That is the proof that the model cannot be validated without a screen artefact: the prior round only caught them because it mentally rendered one row. Left purely to "design later," they surface *after* the model has shipped and screens depend on the shape — exactly when they are most expensive to add (`asOf`, `renews`, `offerId` are all additive-but-load-bearing; retrofitting them means touching the seam, the mock seeds, the compose, and every consumer at once).

**Recommendation — the smallest de-risking artefact, required before the model is called done:** one static **bucket-row state sheet** (not a shippable screen, not in the app — a single artefact: SVG/HTML contact sheet or even an annotated table) showing **one** data bucket rendered in all of its states, at 390 px and at 320 px (400% zoom):
- `ok` (metered): "Data — 7.4 GB of 10 GB left" + secondary bar + "Resets in 12 days (7 Mar)".
- `low`: same + "Running low" word + amber + icon.
- `depleted` (out of data): "0 GB left — out of data" + **Add data** action.
- `expired` (one-time add-on): "Expired 7 Mar" + **Buy an add-on** action.
- `pending` (not-yet-granted): "0 of 10 GB — starts 7 Mar" (see Q2).
- `unlimited`: "Unlimited" in the value slot, no bar, no number, + validity.
- the **out-of-money** neighbour row for contrast: balance at €0 → **Top up** (different axis, different action).

Each row annotated with the exact field(s) it reads. The moment you cannot fill a cell from the model, you have found a missing field *before* it is expensive — which is precisely what happened in round 1, done deliberately instead of by luck. This is a ~1–2h artefact, not a UI change; it does not reopen the "UI is a separate change" decision. It de-risks the model, which *is* this change's only deliverable.

This is **should-fix, not a blocker to starting the backend** — but it must land before the model type is frozen, because the state sheet is what proves the type is complete.

---

## Q2 — Is `ok/low/depleted/expired` the complete set a user must distinguish?

**No. For a real prepaid dashboard it is missing one state the user must *see* (`pending`/not-yet-granted) and conflating two the user must *tell apart* (one-time `expired` vs cyclic `reset`). "Out of data vs out of money" is handled — but by the axis split, not the state enum, and that distinction must be stated so a future `bucketState` never swallows a money check.** The prior review already named `pending` and `renews`; here is the user-facing argument for why each is a *must-distinguish*, not a nicety, plus the one the prior round did not separate.

**a) `pending` / not-yet-granted — a state the user must see.** The research names it (Cash App renders a not-started bucket as "0/10 GB", visible, not hidden, not "depleted"). Onboarding in this very product is mid-flight-capable (`CustomerStatus: "pending"`, `Product.status: "pending"`, `PaymentResult`/`FirstTopUp` have pre-credit states). A data bucket provisioned at order but not yet active at activation is a real 360 state here. Today it renders as either a divide-by-zero (`remaining/total` with `total = 0`) or, worse, falls through to `ok` — a bucket that isn't usable yet reading as "all good." That is the **"faz errado e não percebe"** frame: *the account holder, opening Home mid-activation, sees "all good" on an allowance that has not started, and plans their usage against data they cannot spend.* Fix is the prior review's: add `pending`, or guarantee+document the invariant that no pre-start bucket is composed. Given onboarding reality, `pending` is the honest choice. `EsimProfile` already distinguishes an immediate `status` from a lifecycle `state` — precedent that this product models "requested but not yet active" as a first-class state rather than an absence.

**b) `expired` is doing two users' jobs.** `validUntil` in the past can mean two opposite things with opposite recovery copy and opposite emotional weight:
- a **one-time add-on** that is gone → "Expired 7 Mar — buy an add-on" (recovery = spend again);
- a **cyclic allowance** at cycle end → "Resets in 12 days" (recovery = wait, or top up to renew).

Same ISO date, opposite meaning. The user absolutely must distinguish them — telling someone their monthly data "expired, buy again" when it simply resets tomorrow is the **"não confia"** frame (they'll go check the website because the app is lying to them). The fact lives on the offer in the real model — `Offer.autoRenew` already exists — but it is **not on the bucket**, and the bucket is what `bucketState` sees. The prior review's `renews: boolean` (or `validityKind: "expiry" | "reset"`) on the bucket is the fix; I reinforce it here as a *state-distinction* requirement, not just a copy nicety: without it, `expired` is a single state the UI cannot render two ways, and the research's own `EXPIRING_SOON`/`EXPIRED`-vs-reset separation (Google Data Plan API categories) is lost.

**c) "Out of data" vs "out of money" — handled, but by the axis, and that must be written down.** The user-visible difference is: *out of data* → **Add data** (buy an allowance add-on); *out of money* → **Top up** (credit the balance). The plan gets this right by keeping `Balance` and `usage[]` on separate axes — `depleted` is out-of-*data*, and out-of-*money* stays `hasBalance() === false` on the money axis. This is a genuine strength and should not be reopened. The one risk is entropy: a future `bucketState` author "helpfully" adding a balance check so a depleted data bucket also warns about money, collapsing the two axes the whole design rests on. **Write the invariant into the rule's doc comment: `bucketState` reads the bucket only; it must never read `Balance`.** (Should-fix, cheap, prevents a future regression — the "contradiz" frame against a decision made here.)

**d) Unlimited-with-fair-use-throttle — correctly NOT modelled now.** The research flags a throttle indicator as an open hypothesis with no evidence either way; `Offer.unlimitedData` carries no throttle threshold. "Unlimited always `ok`" is the right base-case call. The only ask (prior review, and the faithfulness audit) is: write it down as a *deliberate* default and do not cite research for it, so a future throttled plan is a known model change, not a surprise. Nit, not a blocker.

**So the complete must-distinguish set for this product is:** `pending · ok · low · depleted · expired(one-time) · reset(cyclic)` on the usage axis, with "out of money" living on the money axis as a sibling, differentiated by **Add data** vs **Top up**. The plan's four-state enum + the axis split gets you three of those distinctions for free and misses two (`pending`, and the `expired`/`reset` fork). Both were named in round 1; the point here is that they are **user-must-distinguish**, not model-tidiness.

---

## Q3 — Accessibility of the usage METER specifically

The prior review's a11y table covered 4.1.3 (live region), 1.4.11 (fill-vs-track 3:1), 1.4.1, 1.3.1, 1.4.10. The orchestrator asks a sharper question the table did not answer outright: **is `role="progressbar"` right for a usage meter, or is it text + a decorative bar? And does the model carry enough to generate the announcement, or is display-formatting leaking into the model?**

**Recommendation: text carries the value and the warning; the bar is decorative (`aria-hidden`). Do NOT use `role="progressbar"` for the allowance meter.** Reasoning, tied to the research's own §4 primary sources:

- A `progressbar` is **not a live region** — it does not announce on change (ARIA APG; ARIA25). The research is explicit that the warning must be announced as *text*, via an `aria-live` status region. So the progressbar role buys you nothing for the one thing that matters (the "running low" announcement) and adds a second, competing accessible name.
- `progressbar`'s `aria-valuemin/max` **default to 0/100** (MDN) and AT commonly announces it as a bare percentage ("77%"). But the research's whole representation finding is **number-first, remaining-framed** — "2.3 GB of 10 GB left," not "77%." A progressbar announcing "77%" actively fights the chosen framing and re-introduces the "used%" mental model the design rejected.
- `progressbar` semantically means *task progress* (a thing advancing to completion), not *a depleting allowance*. `role="meter"` is the closer semantic — but `meter` has weak/uneven AT support and still isn't a live region, so it has the same announcement gap with worse coverage.

Therefore: the accessible object is a **labelled text group** ("Data: 2.3 GB of 10 GB left, running low"), and the bar is a **decorative visual reinforcement** marked `aria-hidden="true"` (or `role="img"` with an `alt` equal to the same text — but then dedupe so the value isn't read twice). The bar still must meet **1.4.11 fill-vs-track ≥3:1** as a *graphic* (the prior review's point about not using `accent-tint` as the track stands). This matches the ruler: `data-ring` is a listed component and the ruler's "the only big thing is the number that matters" says the number is primary, the graphic secondary — a decorative bar is consistent with the system; a progressbar announcing a percentage is not.

**How `low` vs `depleted` must differ for a screen reader** — not just a louder version of the same string, and both `polite` (a usage state is informational, never an `assertive` interruption):
- `low`: *"Data: 2.3 GB of 10 GB left, running low."* — state word + the number still present (you can still browse).
- `depleted`: *"Data: no data left. Add data to keep browsing."* — the number is **0/gone**, so the string leads with the *consequence* and the *recovery action*, because "0 GB of 10 GB left" read aloud is a weaker signal than naming the state and the fix. This mirrors the research's depleted shape (what happened + how to recover) and the four Mobbin depleted screens (icon + headline + action).
- `expired`: *"Data: expired 7 March. Buy an add-on to continue."* (one-time); `reset`: not an alarm at all — *"Data: resets in 12 days."*
- `pending`: *"Data: 10 GB, starts 7 March."* — present, not an error, not "all good."

**Does the model carry enough to generate those strings, or is formatting leaking into the model?** This is the crux and it splits cleanly:
- The **values** the string needs are legitimately model concerns and are mostly present: `remainingUnits`, `totalUnits`, `unit`, `validUntil`, `type` → label, and (after the known fixes) `state`, `renews`/`validityKind`, `asOf`, `offerId`. These belong in the model/compose.
- The **rendering** of those values into one locale-correct sentence — "2.3 GB" (MB→GB, 3 sig-figs, decimal base), "running low," "Add data," the de-AT vs en-US word order and `tabular-nums` — is **display formatting and must NOT live in the model.** A `unit: "MB"` enum + a raw `remainingUnits: 2300` is the right model; a `displayValue: "2.3 GB"` string on the bucket would be formatting leaking into the data (and would break i18n, since the model is locale-agnostic and the ruler mandates keys).

So the correct seam is the prior review's `describeBucket(bucket, now, t)` **pure rule** — not a model field, not inline in the component. It sits beside `bucketState` in `customer360-rules.ts`, takes the translator `t`, and returns `{ state, valueText, stateWordKey, recoveryActionKey, recoveryTarget }`. That keeps the *model* free of display concerns (no leak), keeps the *component* free of logic (no re-derivation/drift), and gives the aria-live region, the visible card, and any future push notification **one** source for the sentence. The model carries the facts; the pure rule composes the sentence; the component only places it. **This is the single most important structural call in the whole change, and it is already named in round 1 — I am confirming it survives the meter-specific lens: yes, and it is what prevents the progressbar/percentage anti-pattern from creeping back in via the component.**

---

## Q4 — Content / UX framing

**a) "X of Y left" vs "X used" — "left" is right, keep it.** The research's representation finding and its (flagged-as-unvalidated) hypothesis both favour remaining-framed, because it answers the user's actual prepaid question — *can I keep going?* — not an accountant's question — *how much did I burn?* "2.3 GB of 10 GB left" also carries the denominator, so the user sizes the remainder without math. "77% used" fails three ways: it drops the absolute remaining GB (the number the user wants), it's the percentage a progressbar would wrongly announce (Q3), and it frames consumption as an achievement rather than a budget. The one honest caveat (from the research's Hipótese) is that no telecom-specific study proves "left" beats "used" — so this is a defensible, evidence-leaning default, not a proven one. Keep "left"; don't claim it's validated.

**b) Relative + absolute validity on a 390 px row — show both, but rank them and don't let both compete.** The research shows real apps split: Cash App uses the absolute date ("Next renewal Sep 7, 2026"), Ahead/Airalo use relative ("Refreshes in 2 hours" / "Validity 3 days"). The research's own hypothesis is that pairing them helps but is untested. On a 390 px row the risk is clutter, so the recommendation is **relative as the primary, absolute as a secondary anchor in the same line, de-emphasised** — "Resets in 12 days (7 Mar)" — not two separate rows and not two equal-weight chips. Relative answers "how long do I have" at a glance; the date disambiguates "12 days from *when*" and survives the user re-opening the app three days later (relative-only drifts if the string is cached/stale — which ties back to `asOf`). At 320 px / 400% zoom, the parenthetical date may wrap below — that is acceptable (prior review's 1.4.10 point); it must never force horizontal scroll. **Model implication: none beyond what's known** — the bucket carries the ISO `validUntil` (+ `validFrom` from the fixes) and `renews`/`validityKind`; the "12 days" and "(7 Mar)" are both *formatting* of those ISO facts in `describeBucket`, not new fields. Correctly no leak.

**c) Unlimited rendering — the plan is right; one addition.** "Unlimited" as the word in the value slot, no bar, no remaining number (Cash App) is correct and matches `Offer.dataAmount: "Unlimited"` precedent. The one thing to carry through: an unlimited bucket **still shows validity** if it has one ("Unlimited · resets in 12 days") — unlimited means no *quantity* cap, not no *time* bound. The research shows unlimited rows dropping the number but keeping status + validity. So `validUntil`/`renews` must still be read for an unlimited bucket even though `totalUnits`/`remainingUnits` are absent — a small but easy-to-miss point for whoever writes `describeBucket` (don't early-return on `unlimited` before formatting validity).

**d) One content point neither prior round made — the canonical-MB + unit-enum choice is right *for storage*, but the row must not show mixed units within a concept.** Data in GB (from MB), voice in minutes, SMS as a count — fine, that's the `unit` enum's job. The trap is a voice bucket showing "432 of 500 min left" next to a data bucket showing "2.3 GB of 10 GB left" next to SMS "870 of 1000 texts left": three different noun-units stacked, which is correct but demands the *label* carry the noun ("Calls," "Texts," "Data") so the unit never has to disambiguate the row. The prior review's "type → i18n label" point covers the mechanism; the content requirement is that the label, not the unit, tells the user which bucket they're reading. Keep voice/SMS as separate buckets (don't merge to Cash App's "Calls/texts" combined row) unless a later UI decision says otherwise — the model's separate `voice`/`sms` types are the more flexible base.

---

## Q5 — The plan's four open questions, answered

**Q1 (plan): single 20% `low`, or tiered `low`(20%) + `notice`(50%)?**
→ **Single `low` at 20% now, as a named constant, with the 50% `notice` tier deliberately deferred and written as deferred.** This is the faithfulness audit's must-fix #3 and the prior review's "vale corrigir," and I concur without reservation: there is no consumer that needs a distinct 50% notice yet (no UI, no notifications), the research marks 50% as *optional*, and C360_012 says "a **configured** %" — so the cutoff must be a parameter, not a literal `0.20` buried in the rule. `export const LOW_REMAINING_RATIO = 0.2;` honours "configured %," makes the 50% notice a one-line future addition, and stops the number being reopened every review. Do **not** put a second tier in the enum now — that's speculative state for an absent consumer.

**Q2 (plan): plain `number` in `unit` vs money-style `{ value, unit }`?**
→ **Plain numbers are enough now; this is the right simplicity call.** The faithfulness audit notes `{ value, unit }` is closer to TMF654's amount+units pair and to the money axis's `{ amountMinor, currency }`, and is cheaper now than a later migration — that's a fair point and the only argument for the richer shape. But weigh it honestly: the money axis uses `amountMinor` specifically to avoid float-rounding on currency; data/voice/sms have **no float-precision hazard** (MB, minutes, SMS are integers or clean decimals), so the reason the money shape exists doesn't apply here. A `{ value, unit }` wrapper would be ceremony without the payoff that justifies it on money. **Keep `remainingUnits`/`totalUnits` as plain numbers + the `unit` enum.** The one guardrail: document that `unit` is the formatting key `describeBucket` switches on (MB→GB vs min vs count), so the "plain number" doesn't invite ad-hoc formatting in components. If TMF654 fidelity later forces the pair, it's an additive wrap — not a reason to over-model today.

**Q3 (plan): seed a `roaming` bucket in the base-case demo, or defer?**
→ **Seed it, but seed it honestly.** The plan's own goal is to "exercise both render paths" and the state sheet (Q1) needs every state visible. Roaming is the bucket most likely to be `pending`, `expired` (one-time travel pack), or absent — i.e. it exercises exactly the states the four-state enum is weakest on. Dropping it would hide the `pending`/`expired`-vs-reset gaps behind a tidy data/voice/sms set. So seed a roaming bucket **and** make it a one-time, expiry-not-reset pack, so the demo forces the `renews`/`validityKind` and (ideally) `pending` decisions into the open. Caveat from the research's units note: a roaming bucket is semantically *data* (it has MB) — the prior review flagged that `type: "roaming"` conflates "what's metered" with "where" — so label it "Roaming data," don't invent a `unit` for it. If the base-case demo truly has no roaming entitlement, seed it `pending` or omit and note the omission — but don't omit silently, because that's the state coverage you most need to see.

**Q4 (plan): `bucketState` in `customer360-rules.ts` or its own file?**
→ **In `customer360-rules.ts`, beside `composeCustomer360` and the other pure rules.** That file's whole stated purpose is "pure, no I/O, never throw" composition and derivation, and `bucketState` + `describeBucket` are exactly that. Co-locating them means the state logic sits next to the compose that stamps `state`/`asOf` onto the bucket (Q1/Q3), shares the file's test harness, and is discoverable where `hasBalance`/`primaryPlan` already live. A separate file would only pay off if usage logic grew large and independent — it won't at this scope, and splitting pre-emptively is the kind of speculative structure the ruler and the Karpathy "simplicity first" guidance both warn against. One file, same discipline.

---

## Verdict — build the backend now, with one gate

**The model, after the three known must-fixes (`validFrom`/`validFor`; stable `offerId`/product ref; 20% as a named constant with the 50% tier deferred), is sufficient to build the seam, the mock, the pure rules, and the composition now — on one condition: the model type is not frozen until the one-row state sheet (Q1) and the two state additions (Q2: `pending` + the `expired`/`reset` discriminator) are resolved.** Those are not "design the screen first" — they are "prove the model against one drawn row first," which is a ~1–2h artefact, not a UI change.

Put concretely, the build order that is safe to start today:
1. Land the seam (`getUsage`), the mock seeds (incl. an honest roaming + one near-threshold + one `pending`/`expired`), the fan-out, and `composeCustomer360` passing `usage[]` through — **this is safe now**, it mirrors balance/interactions exactly and degrades to `[]`.
2. In the same change, add to the model the fields the prior rounds found — `validFrom`/`validFor`, `offerId`, `asOf`, `renews`/`validityKind` — and the states `pending` (+ guard the divide-by-zero). These are all additive and all load-bearing for the screen that pays off the Home promise; adding them after screens depend on the shape is the expensive path.
3. Put `bucketState` **and** `describeBucket` (pure, returning value-text + state + state-word-key + recovery-target) in `customer360-rules.ts`, with the invariant `bucketState` never reads `Balance` written into the doc comment.
4. Produce the one-row state sheet as the artefact that *proves* steps 2–3 are complete. If a cell can't be filled from the model, the model isn't done — fix it before freezing the type.

**Do you need a full designed screen before the backend? No.** **Do you need zero screen, as the plan currently says? Also no** — "zero screen" is what let five load-bearing fields stay invisible until round 1 caught them by accident. The honest middle, and the recommendation, is: **build the backend now; gate the model's type-freeze on one drawn row.**

---

## Prioritised summary

### Blockers (model is not *complete* until these land — none blocks *starting* the backend)
1. **State set is incomplete for a prepaid user (Q2).** Add `pending` (or a documented no-pending-composed invariant) — today a not-yet-granted bucket divide-by-zeros or reads as `ok` ("faz errado e não percebe"). Add a `renews`/`validityKind` discriminator so `expired`(one-time → buy again) and `reset`(cyclic → wait) render differently from the same `validUntil` ("não confia" if confused). Both named in round 1; here established as *user-must-distinguish*, not tidiness.
2. **State must be a field, composed once; the sentence must come from a pure `describeBucket`, never the component (Q3).** Confirmed against the meter-a11y lens: this is also what keeps the `progressbar`/"77%" anti-pattern out of the component. `FirstTopUp.state` is the house precedent. (Round 1 blocker 1 — reconfirmed, not repeated.)
3. **`asOf` freshness marker (Q3 values).** A money-numbered meter with no "as-of" is the prepaid stale-number trap; cheap now, impossible to retrofit cleanly. (Round 1 blocker 2 — reconfirmed.)

### Should-fix
- **Produce the one-row state sheet before freezing the model type (Q1).** The artefact that proves the type is complete; ~1–2h, not a UI change. This is the concrete answer to "does deferring all UI risk a model that won't fit" — yes, so draw one row.
- **Use `role=progressbar`? No — text + decorative (`aria-hidden`) bar (Q3).** Progressbar isn't a live region and announces a percentage that fights the number-first/"left" framing. Bar still meets 1.4.11 fill-vs-track ≥3:1 as a graphic.
- **Write the axis invariant into `bucketState`'s doc comment (Q2c):** reads the bucket only, never `Balance`. Prevents a future "contradiz" regression that would collapse out-of-data vs out-of-money.
- **Keep validity for unlimited buckets (Q4c):** "Unlimited · resets in 12 days" — don't early-return on `unlimited` before formatting validity.
- **Seed roaming as a one-time expiry pack (Q5-Q3):** it exercises the `pending`/`expired` states the enum is weakest on; label it "Roaming data."

### Nits / preferences
- `describeBucket`/`bucketState` live in `customer360-rules.ts`, not a new file (Q5-Q4). One file.
- Plain `number` + `unit` enum, not `{ value, unit }` (Q5-Q2) — the money shape's float-safety reason doesn't apply to MB/min/count.
- "Unlimited always `ok`" — keep as a *deliberate* default; don't cite research for it (faithfulness audit; round 1 nit).
- Relative-primary + absolute-secondary validity on one de-emphasised line, not two chips (Q4b).

## Preciso saber antes
- **Is there a scheduled/future-dated allowance in the real driver (Fase 8)?** Suspends: whether `pending` is a *required state* or a *forbidden invariant* (blocker 1). The product's own `pending` customer/product statuses make a future-dated bucket plausible, so I lean "required."
- **Will the depleted recovery action deep-link to a specific offer, or a generic Add-ons tab?** Suspends: whether `offerId` on the bucket is required now (faithfulness must-fix #2 says add it regardless; this only affects whether the deep-link is wired in the UI change).
- **Does a bucket's remaining value change within a session in the real driver, or only on reload?** Suspends: the exact aria-live trigger (on-cross vs on-load) — not the need for `asOf` or the live region.

## Limites desta revisão
- **No visual verification.** No screen, no rendered UI, no contact sheet — I reviewed the model and the described UI against the research, the ruler, and the real `model.ts`/`customer360-rules.ts`. I did not run the app or capture screens (no Bash/browser here). The one-row state sheet I recommend would itself need a `ui-capture` pass when the UI change lands — especially fill-vs-track 3:1 and 320 px reflow, which I could only reason about.
- **Meter a11y recommendations** (progressbar vs text+decorative bar, announcement wording) are derived from the research's WCAG/ARIA primary sources applied to this case; the research itself flags that no observed *carrier* screen-reader wording was found. So the exact strings are defensible, not evidenced from a shipping telecom app.
- **TMF654 field names** (`validFor`, product reference) carry the faithfulness audit's own caveat: confirmed against a spec summary + a vendor implementation, not the normative v4.0.0 PDF. Confirm exact names against the release the DMP targets before they enter the model.
- **No regression diff:** this is r2 of the *plan* review; I built on r1 rather than re-deriving it. The plan itself is unchanged since r1, so there is nothing new to diff — r1's findings are taken as still-open unless the plan is edited.
- TMF635 history and real metering out of scope by declaration — not evaluated.
