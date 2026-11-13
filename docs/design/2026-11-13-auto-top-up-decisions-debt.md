# Auto top-up — decisions, honesty locks & Fase 8 debt (anchor)

**Status:** shipped (Figma fuon-selfcare P13 → P15s), demo-faithful. **Audience:** whoever reviews
the auto top-up feature or wires the first real auto-recharge backend (Fase 8).

Auto top-up (`/auto-top-up`) was built from the Figma intro → review → on-state → turn-off screens
on a CBEV/DXP-faithful mock backend. This records the decisions that shaped it, the honesty locks
that keep the UI from promising what the backend can't back, and the debt that must be resolved
before a real standing charge, a real scheduler, or a real payment agreement flows.

Scope anchors:
- Preferences seam (opt-in state): `src/services/preferences/*` + `src/services/preferences.functions.ts`.
- Config model: `src/services/model.ts` (`AutoTopUpConfig`, `SavedPaymentMethod`).
- Pure trigger rule (single source): `src/services/auto-top-up-rules.ts` (`shouldAutoTopUp`).
- UI + phase machine: `src/routes/auto-top-up.tsx` (`intro | review | result`, plus the on-state
  branch and the turn-off sheet).
- First charge / recurring charge: reuses `src/lib/topup-payment.ts` (`runTopUp`) — the SAME
  authorize → capture → credit the manual top-up uses.
- DEV-only trigger simulation: `src/components/demo/auto-top-up-trigger.tsx`.
- Entry points: `src/components/home/balance-card.tsx` (Home link), `src/components/account/auto-top-up-row.tsx` (Account row).
- i18n: `pages.autoTopUp.*` + `pages.account.autoTopUp.*` + `pages.home.autoTopUpLink` in
  `src/locales/en.json` + `de-AT.json` (parity enforced, 491/491).

---

## Decisions (grounded)

1. **Threshold model per the Figma** — top up €20 when the balance falls below €15. The screens,
   the config defaults (`DEFAULT_THRESHOLD_MINOR=1500`, `DEFAULT_AMOUNT_MINOR=2000`) and the pure
   rule all read this model. See debt §2: the real CBEV trigger is benefit **expiry**, not a balance
   threshold, so this is a deliberate divergence toward the designed UX.

2. **The recurring trigger is a pure rule, fired by an explicit control — not a clock.** There is no
   scheduler in the mock. `shouldAutoTopUp(config, balance)` is a pure predicate; the demo fires it
   via a DEV-only button (`auto-top-up-trigger.tsx`). Rejected alternatives: a fake `setInterval`
   (dishonest — implies a background service that doesn't exist) and a check-on-read side effect
   (hidden mutation on a GET). See debt §1.

3. **First charge runs at opt-in** if the balance is already below the threshold, and the result is
   shown in-flow (Figma P14 copy: "the first top-up happens as soon as you turn this on"). Rejected
   the DXP "Skip Payment" opt-in variant — it contradicts the shipped Figma copy. The first charge
   is the SAME `runTopUp` as the manual flow.

4. **New `preferences` seam**, not bolted onto charging or customer360. Auto top-up is opt-in
   configuration + consent state, a distinct concern from the money ledger (charging) and the read
   projection (customer360). Rejected overloading either.

5. **SavedPaymentMethod is a demo surrogate** of the already-tokenized demo card — there is no
   instrument vault. The config "saves" `tokenizeCardMock(DEMO_CARD)` so the recurring charge has a
   method to reference. See debt §4.

6. **`consentAt` is a stand-in for the DXP payment agreement / mandate.** `setAutoTopUp` stamps an
   ISO timestamp; `disableAutoTopUp` clears it (opt-out revokes the standing authorization). See
   debt §3.

## Honesty locks (do not break)

- **Trigger rule == first charge == recurring charge.** The opt-in first charge, the DEV trigger,
  and (eventually) the real scheduler all evaluate the SAME `shouldAutoTopUp` and run the SAME
  `runTopUp`. Never fork a second "auto" charge path that could diverge from the manual one. If the
  real backend owns the trigger (debt §1/§2), this single rule must move WITH it.
- **Nothing is charged without consent.** The intro (P13) explicitly says "Nothing is charged yet";
  the first charge only runs after the consent checkbox gates "Turn on". `disableAutoTopUp` clears
  `consentAt`.
- **The on-state shows only backend-backed config.** The three config rows (threshold, amount,
  method) are read from `AutoTopUpConfig`. The Figma's fourth "First top-up · pending" row is
  OMITTED because the mock has no settlement/pending state and no auto-charge history (debt §7).
- **The turn-off sheet states only what the backend can back** — the current balance and its
  validity. It does NOT echo the Figma's plan-renewal date/price, because the mock holds no renewal
  the UI can trust (debt §8).
- **The demo trigger tops up only when the balance is genuinely below the threshold.** It runs the
  real rule; at a healthy balance it correctly declines with a "nothing to do" toast. No forced
  charge.

---

## Fase 8 debt

### 1. No scheduler — the recurring trigger is demo-fired

**State.** The recurring charge cannot fire on its own; a DEV-only button stands in for the clock
(`auto-top-up-trigger.tsx`, gated on `import.meta.env.DEV`, renders nothing in production).

**The real work (Fase 8).** A real deployment needs a server-side scheduler / event source (CBEV
balance-event or expiry-event subscription) that evaluates the trigger and fires the charge, with
retry/backoff and a notification on success/failure. The pure `shouldAutoTopUp` is the decision
core to keep; the firing mechanism is what's missing. Anchor: `src/services/auto-top-up-rules.ts`.

### 2. Threshold model vs. CBEV expiry trigger

**State.** The UI triggers on "balance < €15" (the Figma model). Glean research on the real CBEV
auto-recharge shows the production trigger is benefit **expiry** (recharge as a benefit is about to
lapse), and the balance-threshold integration is noted as "integration not done".

**The real fix (Fase 8).** Reconcile the designed threshold UX with the CBEV expiry trigger: either
the catalog gains a threshold trigger, or the UX is reframed around expiry. Until then the threshold
model is a deliberate divergence toward the shipped design, documented here so it is not mistaken
for parity with the real charging platform.

### 3. `consentAt` is a stand-in — no real payment agreement / mandate

**State.** Consent is a single ISO timestamp on the config. There is no standing-authorization
document, no mandate reference, no audit trail.

**The real work (Fase 8).** A real auto-recharge needs a payment agreement / mandate (recurring
authorization) with the PSP and a revocation record. TMF651 (Agreement Management) is the likely
TM Forum contract but is **NOT confirmed** for this platform — do not assume it without checking.
Anchor: `src/services/preferences/preferences-mock.ts` (`setAutoTopUp`/`disableAutoTopUp`).

### 4. SavedPaymentMethod is a surrogate — no instrument vault

**State.** The method is the already-tokenized demo card; `SavedPaymentMethod` carries a label + the
mock token. There is no list/add/choose/default of stored instruments.

**The real work (Fase 8).** Real auto top-up references a stored instrument from the PSP/BSS vault;
our code must never see a PAN (same principle as the top-up and security-debt docs). Shares the
saved-card debt with the top-up flow. Anchor: `src/services/model.ts` (`SavedPaymentMethod`).

### 5. Opt-in charge model: charge-on-opt-in (shipped) vs. DXP Skip-Payment

**State.** We charge the first top-up at opt-in when below threshold (Figma). DXP offers a
"Skip Payment" opt-in variant where enabling does not charge immediately.

**The real work (Fase 8).** If the real DXP integration mandates Skip-Payment semantics, the opt-in
branch in `turnOn()` (auto-top-up.tsx) is the one place to change; the Figma copy would change with
it. Documented so the divergence is a known choice, not an accident.

### 6. Opt-in state is client-side and ephemeral

**State.** The `preferences` mock is a module-level `Map` keyed by customerId, and `api.ts` calls
the preferences functions directly (no `createServerFn`), so it lives in the client JS. A full page
reload resets it to OFF. This is consistent with the rest of the mock (balance, add-ons are also
ephemeral client state — the demo-state-switcher exists because of this).

**The real work (Fase 8).** The real preferences driver persists server-side; opt-in survives
reload and is shared across devices. Anchor: `src/services/preferences.functions.ts` (swap the mock
driver for a real HTTP driver — the stub already exists in `preferences-http.ts`).

### 7. "First top-up" pending row omitted — no settlement / auto-charge history

**State.** The on-state (P15) shows three config rows; the Figma's fourth "First top-up · Today,
€20.00 · pending — your bank is confirming" row is omitted. `runTopUp` credits synchronously (no
pending settlement), and the config stores no auto-charge history.

**The real work (Fase 8).** A real auto-recharge records each charge with a settlement state
(pending → settled/failed) and a history the on-state can surface. Add an auto-charge log to the
preferences/charging model and the pending badge returns honestly. Anchor:
`src/routes/auto-top-up.tsx` (`OnStep`).

### 8. Turn-off sheet does not echo plan renewal

**State.** The sheet body states the current balance + validity only. The Figma also states the
plan's renewal date and price ("The plan still renews Nov 8 for €30"); the mock has no renewal the
UI can trust, so that sentence is replaced with generic copy ("before your plan renews").

**The real work (Fase 8).** When the plan/renewal projection is backend-backed, the sheet can state
the concrete renewal date/price. Anchor: `src/routes/auto-top-up.tsx` (`TurnOffSheet`,
`turnOff.bodyWithBalance`).

### 9. No balance decay by usage — recurring "fires" not reachable in steady state

**State.** With threshold €15 / amount €20, after any top-up the balance is ≥ €20 > €15, so the
recurring trigger correctly declines in steady state. A recurring *fire* is only reachable right
after enabling on an already-low balance (which the opt-in first charge then resolves).

**The real work (Fase 8).** A demo that shows the recurring charge firing in steady state needs
simulated balance decay (usage drawing the balance down over time). Until then, the firing path is
exercised by the opt-in first charge (Inc 2 captures) and the `shouldAutoTopUp` unit tests.

### 10. Account entry row does not reflect On/Off

**State.** `auto-top-up-row.tsx` is a static chevron link; it does not show the current On/Off
state (it would need the preferences query on the Account screen).

**The real work (minor).** Add a trailing On/Off badge driven by `getAutoTopUp` when the On/Off
signal on the Account screen is worth the extra read. Anchor:
`src/components/account/auto-top-up-row.tsx`.

---

## Multi-perspective review (Nov 2026) — complete feature

Reviewed intro → review → on-state → turn-off across six lenses; findings and resolution:

- **Art director / visual.** Figma-faithful: status card with success tile + "On" badge; config
  rows sublabel-first (caption above value) matching the AutoPay row spec; tinted "nothing charged
  yet" card on intro; danger-text secondary for the destructive turn-off; the turn-off bottom sheet
  uses the 20px sheet radius + grab handle. Confirmed against P13/P14/P15/P15s renders. ✓
- **Design engineer.** One route + phase machine (`intro | review | result`) plus an on-state
  branch gated on `config.enabled`; reuses `ResultHead`/`SummaryRow`, `runTopUp`, the `Drawer`
  primitive; local `ConfigRow`/`InfoRow` kept private to the route. No new abstractions beyond the
  `preferences` seam. ✓
- **Accessibility (WCAG 2.2 AA).** Focus moves to the result heading on opt-in (2.4.3); consent is a
  real `<input type=checkbox>` with a wrapping label; "Turn on" is `aria-busy` while working and
  gated on consent; the turn-off sheet is a focus-trapping Drawer with Esc/scrim close; the demo
  trigger button is `aria-busy` while running. Danger is never colour-only — the word "Turn off"
  carries it. ✓
- **Honesty / content.** Every honesty lock above holds: no charge without consent; on-state shows
  only backend-backed config; turn-off sheet states only balance+validity; the pending row and the
  renewal sentence are omitted rather than faked. ✓
- **Product owner.** Entry points match the Figma (Home balance-card link P1 node 210:2097; Account
  row P11 node 210:2080). The opt-in is reversible (turn-off → back to intro). The demo trigger
  makes the otherwise-invisible recurring behaviour demonstrable without a scheduler. ✓
- **Worst-day user.** Low balance at opt-in → first charge runs and the receipt is shown in-flow.
  Declined first charge → falls back to intro to retry (no half-on state persisted with a broken
  charge). Turn-off → clear consequences (balance stays, top up by hand before renewal, no fee,
  reversible). ✓

Entry points confirmed landing on the real screen: `components/home/balance-card.tsx`,
`components/account/auto-top-up-row.tsx`.

Regression: intro → review → turn-on → on-state → turn-off-sheet steps added to
`docs/design/roteiro-captura.json` (steps 16–19, after the top-up/redeem/support steps, reusing the
SPA-nav path because the opt-in state is client-side and a reload would reset it — see debt §6).

---

## Cross-references
- Top-up flow (shared `runTopUp`, saved-card debt): `docs/design/2026-11-13-topup-flow-decisions-debt.md`
- Security & tenancy debt: `docs/design/2026-11-11-fase8-security-debt.md`
- Seam layer + "wire a real system" playbook: `src/services/README.md`
