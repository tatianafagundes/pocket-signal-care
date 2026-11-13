# Top-up flow — decisions, honesty locks & Fase 8 debt (anchor)

**Status:** shipped (Figma fuon-selfcare P2→P6), demo-faithful. **Audience:** whoever reviews the
top-up flow or wires the first real payment/charging backend (Fase 8).

The top-up flow (`/top-up`) was built from the Figma amount→handoff→result screens on a
CBEV-faithful mock backend. This records the decisions that shaped it, the honesty locks that keep
the UI from promising what the backend can't back, and the debt that must be resolved before real
money or real validity rules flow.

Scope anchors:
- UI + phase machine: `src/routes/top-up.tsx` (`amount | handoff | result`).
- Payment orchestration: `src/lib/topup-payment.ts` (`runTopUp`: authorize → capture → credit).
- Idempotency store: `src/lib/topup-progress.ts` (sessionStorage, TTL 10 min).
- Validity rule (single source): `src/services/customer360-rules.ts`
  (`projectedBalanceAfterTopUp`, `TOPUP_VALIDITY_EXTENSION_DAYS`) — the mock
  (`src/services/charging/charging-mock.ts`) imports the SAME constant/rule.
- Card tokenization (mock): `src/lib/card-token.ts`.
- i18n: `pages.topUp.*` in `src/locales/en.json` + `src/locales/de-AT.json` (parity enforced).

---

## Decisions (grounded)

1. **Top-up extends balance validity.** CBEV FC34 "Monetary Balance Validity Control" + the Figma
   result-head spec ("valid until …"). Rule: `validUntil = max(now, currentValidUntil) + 30 days`,
   recovering an already-expired balance. This corrected a pre-existing inaccuracy (top-up used to
   credit without touching validity).

2. **Payment is a simulated external hosted-page handoff** (Figma P3 + DXP-Lite FR-6 "simulated
   payment acceptable"), not an inline card form. "Continue to payment page" runs the real
   authorize→capture→credit payment seam behind the handoff screen.

3. **Results shipped: success (P5) + failed (P6) only.** Pending (P4) and canceled (P6b) are
   OMITTED — the mock payment is deterministic and synchronous, so there is no honest trigger for a
   pending or user-canceled state. Anchored below for Fase 8.

4. **One route + phase state machine**, not sub-routes: a top-up is a transient task, not a
   deep-linkable or reload-resumable journey like onboarding. A reload does not resume a
   half-finished payment UI (but the *payment* is resume-safe — see §Double-charge).

5. **Demo card is read-only** (`Mastercard •••• 7310`): there is no saved-card model in the demo, so
   the method is a documented static artifact, not a selectable/stored instrument.

## Honesty locks (do not break)

- **Preview == backend.** The amount screen's projected "New balance / Valid until" is computed by
  `projectedBalanceAfterTopUp`, the SAME pure rule the charging mock applies on credit, from the
  SAME `TOPUP_VALIDITY_EXTENSION_DAYS`. What the user previews is what the top-up produces. If the
  real backend owns the validity rule (see debt §2), this single source must move WITH it — never
  fork the preview from the backend rule.
- **Success receipt shows the real reference.** `runTopUp` returns the real
  `authorizationRef`; the receipt's "Reference" is that value, not a fabricated id.
- **Failed result shows the UNCHANGED balance.** The P6 copy ("Nothing was charged. Your balance
  stays {amount}, valid until {date}") reads the CURRENT balance, never a projection — because a
  declined/failed payment credited nothing.

---

## Fase 8 debt

### 1. Pending (P4) and canceled (P6b) result screens — anchored, not built

**State.** Only success + failed exist. The mock payment seam resolves synchronously to
`authorized`/`captured` or `declined` (`src/services/payment/payment-mock.ts`), so there is no
honest source for a *pending* ("we'll confirm shortly") or *user-canceled* outcome.

**The real work (Fase 8).** A real PSP hosted page introduces both: an async/pending authorization
(3DS step-up, bank confirmation) and a user who abandons the page. When the real payment driver
lands, add the two result phases and their triggers. The `PaymentResult` status union already
carries `pending` and `requiresAction`; the result phase in `top-up.tsx` is the one place to branch.
The copy exists verbatim in the Figma result-head spec.

### 2. Validity extension is a hardcoded 30 days — must become PO/catalog config

**State.** `TOPUP_VALIDITY_EXTENSION_DAYS = 30` is a constant in `customer360-rules.ts`. It is
correct and single-sourced for the demo, but a real CBEV deployment derives validity from the
product/offer catalog (per denomination, per tariff, per market) — not a global 30.

**The real fix (Fase 8).** The extension window becomes backend-owned (CBEV FC34 driven by the
catalog). The UI must then STOP computing the projection from a local constant and instead show what
the backend returns (or a backend-provided quote), preserving the preview==backend honesty lock
rather than guessing. Anchor: `src/services/customer360-rules.ts`.

### 3. Double-charge mitigation is client-side only — the real guard is server idempotency

**State.** `runTopUp` is idempotent across a reload: authorize-first, each milestone persisted to
sessionStorage (`topup-progress:v1`, TTL 10 min, scoped tenant+customer+amount), and reused on
retry so the card is authorized at most once. This is a genuine mitigation for the reload window
between capture and credit. ONLY `{authorizationRef, captured, credited}` is stored — never the
token or PAN.

**The limits (Fase 8).** sessionStorage is tab-scoped and client-side: it does not protect against a
second tab, a different device, or a cleared store. The authoritative guard is a **server-side
idempotency key** on the payment/charging operations (the PSP's idempotency-key contract +
at-most-once credit in CBEV). When the real backend lands, pass an idempotency key through
authorize/capture/topUp; the client store becomes a UX nicety, not the safety boundary.
Minor latent item: "Try again" with a DIFFERENT amount leaves the prior amount's envelope until TTL
(harmless — scoped + tab-bound), resolved for free once the server key is authoritative.

### 4. Demo card is a static artifact — no saved-card / instrument model

**State.** `DEMO_CARD_NUMBER` / `DEMO_METHOD_LABEL` in `top-up.tsx` are constants; the method row is
display-only. The decline path is reachable only because `tokenizeCardMock` preserves a "4000"
marker for the payment mock's deterministic decline.

**The real work (Fase 8).** Real payment-method selection needs a stored-instrument model (list,
add, choose, default) sourced from the PSP/BSS, and the real hosted page collects the card — our
code must never see a PAN (same principle as §4 of the security-debt doc: no credential in client
JS). Anchor: `src/routes/top-up.tsx` (`DEMO_CARD_NUMBER`), `src/lib/card-token.ts`.

---

## Multi-perspective review (Nov 2026) — complete flow

Reviewed amount→handoff→success/failed across six lenses; findings and resolution:

- **Correctness / money.** Authorize-first; declined costs nothing; credit at most once; money in
  minor units + EUR throughout; `runTopUp` rejects non-positive amounts as a backstop even though
  the amount screen gates it. GOLDEN test mirrors onboarding (once-each + retry-resume). ✓
- **Security / privacy.** No PAN or token persisted or logged; only opaque milestones in a
  tab-scoped, TTL'd store. Inherits the tenant-boundary debt from the security-debt doc §1–2 (not
  specific to top-up). ✓ for demo; server idempotency + auth is Fase 8.
- **Accessibility (WCAG 2.2 AA).** Focus moves to the result heading on each phase change (2.4.3);
  `sr-only role=status` for the loading state; handoff "Continue" is `aria-busy` while paying;
  summary rows are read-only, not spurious tap targets. ✓
- **Honesty / content.** Preview==backend lock; real reference on the receipt; failed shows the
  unchanged balance. No screen promises a capability the mock lacks. ✓
- **State machine / recovery.** `amount | handoff | result`; failed→Try again returns to amount
  (clears failed), success→Home/My plan; anti double-submit guard on `pay()`; customer360 query
  invalidated so Home/Account/My plan refresh. ✓
- **Worst-day user.** Declined card → clear "nothing charged, balance unchanged" + Try again / Get
  help (→ /support). Reload mid-payment → resume without re-charging. Expired balance → top-up
  recovers validity (FC34). ✓

Entry points confirmed landing on the real screen: `components/home/balance-card.tsx`,
`components/home/renewal-notice.tsx`, `components/bottom-tab-bar.tsx`,
`routes/onboarding/success.tsx`.

Regression: top-up amount→handoff→success steps added to `docs/design/roteiro-captura.json`
(steps 09–12, after a reset-to-healthy). The failed state is NOT in the versioned roteiro because
it requires a non-shipping "4000" card; it was captured out-of-band during Inc 4b and is documented
here instead.

---

## Cross-references
- Security & tenancy debt: `docs/design/2026-11-11-fase8-security-debt.md`
- Seam layer + "wire a real system" playbook: `src/services/README.md`
- Per-system contracts: `docs/contracts/`
