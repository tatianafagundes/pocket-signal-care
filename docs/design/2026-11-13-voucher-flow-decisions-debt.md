# Redeem-a-voucher flow — decisions, honesty locks & Fase 8 debt (anchor)

**Status:** shipped (Figma fuon-selfcare P17 → P18), demo-faithful. **Audience:** whoever reviews the
voucher flow or wires the real voucher/charging backend (Fase 8).

The redeem flow (`/redeem`) was built from the Figma "Add a voucher" screens on a CBEV-faithful
mock. This records the decisions, the honesty locks that keep the UI from promising what the backend
can't back, and the debt that must be resolved before real vouchers or real validity rules flow.

Scope anchors:
- UI + phase machine: `src/routes/redeem.tsx` (`enter | result`; the error is INLINE on `enter`).
- Seam op: `src/services/charging.functions.ts` (`redeemVoucher`), driver
  `src/services/charging/charging-driver.ts`, mock `src/services/charging/charging-mock.ts`.
- Schema: `src/schemas/charging.ts` (`redeemVoucherSchema`). Result type: `VoucherRedemption`
  in `src/services/model.ts`.
- Shared result primitives: `src/components/result-summary.tsx` (ResultHead + SummaryRow, shared
  with top-up). Validity rule constant reused: `TOPUP_VALIDITY_EXTENSION_DAYS`.
- i18n: `pages.redeem.*` (+ `pages.topUp.addVoucher`) in en + de-AT (parity enforced).
- Entry: a discreet "Add a voucher instead" link on the top-up amount screen (decision below).

---

## Decisions (grounded)

1. **Monetary voucher recharge only** (the card-less path that credits the main balance). Grounded
   in the dossiê ("voucher as an alternative to the card; no card/authorize/capture") and the DXP
   docs' "Monetary Recharge — Voucher based". The **offer-based** voucher journey (voucher → eligible
   recharge offers → shopping cart → order) is a different DXP journey and is OUT OF SCOPE here.

2. **The face value is resolved server-side from the code** — the client sends only `{customerId,
   code}`, never an amount. Grounded in BUC C349A_5 ("voucherActivationCode translated to refill
   profile Id and amount by the voucher server") and DXP Recharge BUC R_003 ("minimal info = PIN +
   MSISDN"). `redeemVoucher` returns `creditedMinor` from the seam; the UI shows that, never a sum.

3. **Seeded demo voucher registry (fixed codes)**, not derived-from-code values: `447103928816` =
   €20 (extends validity), `100020003000` = €10 (credit only), `999988887777` = already redeemed.
   Deterministic — demonstrable and capturable. Each valid code redeems once per server run.

4. **Validity extends only at/above €20** (Figma P17 copy: "€20 or more also sets the validity to 30
   days from today"). This is a **prototype/product rule from the design, NOT a documented CBEV rule**
   — Glean could not confirm a face-value validity threshold in CBEV/DXP. Treated as a mock/config
   rule; see debt §2.

5. **Anti brute-force wrong-attempt counter** (bars after 5 wrong codes/day per customer). Mirrors
   the DXP refill-fraud counter (Recharge BUC R_001: "increase the number of wrong attempts … barred
   above the daily threshold"). The bar is checked BEFORE the code lookup, so being barred reveals
   nothing about any code.

6. **Entry via a discreet link on the top-up screen** ("Add a voucher instead"), not a tab or a Home
   CTA — the voucher is the card-less alternative to a top-up, so it sits next to the top-up path
   without competing with the primary Pay action.

7. **Inline error, not a separate result phase** (unlike top-up's failed screen): a wrong code is a
   correction, so the error stays on the enter screen (danger field + alert line + Get help), and
   the user fixes the code in place.

## Honesty locks (do not break)

- **Server value, not a client sum.** The receipt's "Added" is `creditedMinor` from the seam; the
  "New balance" is the seam's returned balance. The UI never computes or guesses a voucher's value.
- **The full code is never echoed back.** The receipt masks it to the last 4 ("Voucher •••• 8816");
  the 12-digit code is sent to the seam and never shown again or logged.
- **Indistinct invalid error.** Unknown and already-used codes return ONE error ("isn't valid or was
  already used"), so the UI cannot be used to probe which codes exist. The seam enforces this; the
  UI preserves it.
- **A failed/used code credits nothing.** The balance context on the error path is the unchanged
  current balance.

---

## Fase 8 debt

### 1. The voucher registry is an in-memory mock — the real resolver is NGVS via CBEV refill

**State.** `charging-mock.ts` holds a seeded `Map` of code → face value + redeemed flag, and flips
the flag on redemption. Correct and deterministic for the demo.

**The real work (Fase 8).** A real redemption validates and commits the PIN against the Next
Generation Voucher Server (NGVS) and credits via CBEV refill — `POST /cha/refill/v1/voucherBasedRefill`
(BUC C349A_5), which maps the voucher to its refill profile + amount. Wire this in
`charging-http.ts` (TMF/REST mapping lives only there). The seam contract
(`redeemVoucher(customerId, code) -> VoucherRedemption`) already matches. Anchor: `charging-http.ts`
(stub `notConfigured`).

### 2. Validity threshold (€20) is a hardcoded prototype rule — not a documented CBEV rule

**State.** `VOUCHER_VALIDITY_THRESHOLD_MINOR = 2000` in `charging-mock.ts` gates `extendValidity`.
It comes from the Figma copy, not from CBEV/DXP docs (Glean could not confirm a face-value validity
threshold).

**The real fix (Fase 8).** Validity behaviour is catalogue/refill-profile driven in CBEV (FC34 +
the voucher's profile), not a global €20 rule in the channel. When the real backend lands, the
extension (and whether it happens) comes from the refill result, and the UI shows what the backend
returns rather than applying a local threshold. Anchor: `charging-mock.ts`
(`VOUCHER_VALIDITY_THRESHOLD_MINOR`, `redeemVoucher`).

### 3. The wrong-attempt counter is in-memory per day — the real bar is server-side + persisted

**State.** `voucherAttempts` is a `Map<customer, {count, day}>` in the mock: it counts wrong codes
and bars at 5/day. It resets on a server restart and is not shared across devices.

**The real work (Fase 8).** DXP exposes a refill-fraud counter API (Recharge BUC R_001): increment
on failed validation, persist the daily count per MSISDN, and a "barred?" check the channel calls.
The authoritative counter is server-side and persisted. When wired, the UI keeps the same two
outcomes (invalid vs barred); only the source of truth moves. Anchor: `charging-mock.ts`
(`VOUCHER_MAX_WRONG_ATTEMPTS`, `recordWrongAttempt`, `wrongAttemptsToday`).

### 4. Offer-based voucher recharge is out of scope

**State.** Only monetary voucher recharge (credit the main balance) is built.

**The real work (Fase 8).** The offer-based journey (validate PIN → present eligible recharge offers
from the catalogue → shopping cart → submit order → commit voucher) is a separate DXP journey
spanning catalog + order seams, not just charging. It is intentionally not attempted here.

---

## Multi-perspective review (Nov 2026) — complete flow

Reviewed enter → success / inline-error across six lenses; findings and resolution:

- **Correctness / money.** Value is server-resolved (never a client amount); credit happens once
  (the seam flips redeemed); validity extends only above the threshold; money in minor units + EUR.
  GOLDEN tests cover €20-extends, €10-doesn't, indistinct errors, validation, brute-force bar,
  forced-error degrade. ✓
- **Security / privacy.** The 12-digit code is never echoed back (masked to last 4) or logged;
  unknown vs used is indistinct; a daily wrong-attempt bar limits probing. Inherits the tenant
  boundary debt from the security-debt doc (not voucher-specific). ✓ for demo; NGVS + server
  counter + auth are Fase 8.
- **Accessibility (WCAG 2.2 AA).** Field has a real `<label>`; error line is `role="alert"` with
  `aria-invalid` + `aria-describedby` wiring; focus moves to the result heading on success (2.4.3);
  numeric `inputMode`. ✓
- **Honesty / content.** Added = server face value; New balance = server balance; a used/invalid
  code credits nothing and says so without revealing which. ✓
- **State machine / recovery.** `enter | result`; the error is inline (correction in place), editing
  the code clears it, anti double-submit guard; customer360 invalidated so Home/Account/My plan
  refresh. ✓
- **Worst-day user.** Wrong/used code → clear, non-leaky message + Get help (→ /support). Too many
  tries → distinct "try again later". €20+ voucher recovers an expiring balance (validity set 30
  days out). ✓

Entry confirmed: "Add a voucher instead" on the top-up amount screen lands on `/redeem`.
Regression: redeem enter + filled added to `docs/design/roteiro-captura.json` (steps 13–14, via
direct `/redeem` navigation so the step never consumes a one-shot voucher code). The success and
inline-error states were captured out-of-band during Inc 3 / Inc 4 and are documented here.

---

## Cross-references
- Top-up decisions & debt: `docs/design/2026-11-13-topup-flow-decisions-debt.md`
- Security & tenancy debt: `docs/design/2026-11-11-fase8-security-debt.md`
- Seam layer + "wire a real system" playbook: `src/services/README.md`
- Per-system contracts: `docs/contracts/`
