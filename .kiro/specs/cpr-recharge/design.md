# Design — real DXP recharge (payment direct-capture + monetaryRecharge)

## Overview

Turn the mock top-up into the real DXP recharge on the http path, WITHOUT changing the mock
`runTopUp`/auto-top-up path (the committed default). The hard part is not the HTTP — it is that the
DXP flow (direct-capture `/payment/v4/payment` → `monetaryRecharge` journey) does not map onto the
existing authorize→capture→credit seam sequence. This design resolves that mismatch (Req 0) first,
then specifies the two http calls, the recharge BFF, and the fake.

Confidence: the EXISTING code (seams, runTopUp, BFF) is high (read directly); the two DXP recharge
shapes are MEDIUM (fields + TMF676 swagger, no full captured sample) — so mappers are written
against the fake + response-shapes.md and reconciled at cluster cut-over.

## Req 0 — the seam-shape decision (the core of this spec)

### Decision D-recharge-op: a NEW seam operation, not a reinterpreted authorize/capture/topUp
The mock `runTopUp` calls three `api.*` methods (`authorizePayment`, `capturePayment`, `topUp`) that
map cleanly onto the mock's two-phase payment + TMF654 credit. The DXP flow is structurally
different (one direct-capture + one journey, needing contractId + payment refs). Forcing it into the
three existing methods would either (a) lie about `authorize` (there is none) or (b) overload
`api.topUp({customerId, amountMinor})` whose signature cannot carry contractId/MSISDN/payment refs.

So: introduce a driver-level recharge that the http path uses, while the mock path keeps
`runTopUp` unchanged. Two sub-options considered:

- **(A) New `charging.recharge(input)` seam op** — input `{ customerId, contractId, communicationId,
  amountMinor, methodToken }`; the driver owns the two-call orchestration (payment then journey) and
  returns `{ partyInteractionId, balance }`. The mock implements it as capture+credit; the http
  driver implements it as the two real calls. `runTopUp` on the http path calls `api.recharge`
  instead of the authorize/capture/topUp trio.
- **(B) Keep the trio, make the http payment driver's `capture` do `/payment/v4/payment` and the
  http charging `topUp` do the journey, threading refs via widened signatures.**

**Chosen: (A).** Rationale: the two-call flow is one atomic business action with a shared set of
refs (paymentId/authorizationCode flow from call 1 into call 2); modelling it as one seam op keeps
those refs inside the driver instead of leaking them through `runTopUp` state and widened
`api.topUp`/`authorize` signatures. (B) would ripple the contractId/refs through the payment AND
charging seams and the `runTopUp` resume model, which is more change and more lying (a DXP
"authorize" that does nothing). (A) is additive: a new op, mock + http, chosen by driver.

### How `runTopUp` picks the path
`runTopUp` stays the orchestrator and the mock path is byte-for-byte unchanged. On the http path it
branches to `api.recharge(...)` (one call) instead of authorize→capture→credit. The branch is by
driver, resolved once (like every seam). The manual + auto-top-up callers are unchanged — they
still call `runTopUp`; only `runTopUp`'s internals fork. (If the fork inside `runTopUp` proves
awkward, the fallback is a separate `runRecharge` the http callers use — decide in implementation,
record it.)

### D-two-credit-sites (M1) — onboarding first top-up ALSO forks to recharge
There are TWO places that credit a balance, not one:
- `runTopUp` (standalone top-up: top-up.tsx, auto-top-up.tsx, DEV trigger).
- `runOnboardingSubmit` credits the FIRST top-up by calling `api.topUp({customerId, amountMinor})`
  **directly** (onboarding-submit.ts ~line 274), NOT via runTopUp.

If only `runTopUp` forked to `recharge`, then under `VITE_ECEV_DRIVER=http` the onboarding first
top-up's `api.topUp` would hit the charging http driver — `notConfigured` in this spec — and the
onboarding http path shipped by the previous spec would REGRESS (the first top-up would fail).

Decision: the onboarding first top-up ALSO goes through the recharge op on the http path. Onboarding
already has `state.contractId` (created in step 3b) and the reserved MSISDN, so it can build the
same `RechargeInput`. Concretely, the onboarding "credit" step branches by driver like runTopUp:
mock → `api.topUp` (unchanged); http → `api.recharge({ customerId, contractId, communicationId,
amountMinor: planPriceMinor, methodToken })`. The mock path and the committed default are unchanged.
This widens Task 3 to touch `onboarding-submit.ts`'s credit step as well — in scope, because the
alternative is a flag that breaks onboarding.

(If wiring the fork into both `runTopUp` and `onboarding-submit` proves to duplicate logic, factor
the driver-branch into one helper both call — decide in implementation, record it.)

### D-credit-returns-no-balance (Req 0.3)
The journey returns `{partyInteractionId}`, not a Balance. The recharge op does a follow-up
`getBalance(customerId)` after the journey and returns `{ partyInteractionId, balance }`, so
`TopUpResult.balance` is satisfied by a real read, not fabricated. If `getBalance` is still mock
(charging http not wired for reads in this spec), the balance is the mock's — documented honestly.

### D-contractId-source (Req 2.2)
The journey needs `contractId`. Source: the contract created at onboarding, persisted as
`state.contractId`; for a returning customer (no onboarding state) it comes from the customer360 /
a contract lookup by customerId+MSISDN. In THIS spec, require the caller to pass `contractId`
(onboarding has it); the returning-customer lookup is a recorded follow-up. Missing contractId →
`SeamError` (validation), never an empty reference.

## Components & changes

### 1. Domain + schema (additive)
- `RechargeInput` schema: `{ customerId, contractId, communicationId (E.164), amountMinor (+int),
  methodToken }`. `RechargeResult` type: `{ partyInteractionId: string; balance: Balance | null }`.
- These live beside the existing charging schemas/types; money stays minor units in-domain.
- **`methodToken` is mock-only (M3):** it exists because the mock payment path expects a tokenized
  method (and `tokenizeCardMock` produces it). The REAL `/payment/v4/payment` uses
  `paymentMethod.@type:"cash"` + the payment refs, NOT a tokenized card — so `toTmfPayment` MUST NOT
  put `methodToken` on the wire. It stays in the domain input for the mock; the http mapper ignores
  it (or uses it only for a local decline check if the fake models one). Documented so the mapper
  doesn't send a field DXP doesn't expect.

### 2. Charging driver — new `recharge` op (mock + http)
- `ChargingDriver.recharge(input): Promise<SeamResult<RechargeResult>>`.
- **Mock:** reuse the existing capture+credit mock logic — mint a `partyInteractionId`
  (`pin-<hex>`), credit the mock balance by `amountMinor`, return `{ partyInteractionId, balance }`.
  Keeps the demo working; auto-top-up/manual top-up behave as today.
- **Http:** the two real calls (see §3/§4), via the recharge BFF; returns
  `{ partyInteractionId, balance }` (balance from a follow-up getBalance).

### 3. HTTP: direct-capture payment (`toTmfPayment` / `fromTmfPayment`)
- `POST {bff}/payment/v4/payment`, body = collection shape: `account.id = communicationId`,
  `payer.id = customerId`, `amount { unit:"EUR", value: minorToDecimal(amountMinor) }`,
  `paymentMethod.@type` + the monetaryRecharge `relatedEntity`, `status:"SUCCESS"`. Parse
  `{ id, authorizationCode, transactionDateTime }`.
- Money mapping ONLY here: `minorToDecimal(1101) → 11.01`; `decimalToMinor` on the way back. No
  float arithmetic beyond the single wire conversion (guard rounding).
- 33028 (reused authorizationCode) → `SeamError` conflict/rejected, not retryable (Req 1.3).

### 4. HTTP: monetaryRecharge journey (`toTmfMonetaryRecharge` / `fromTmfInteraction`)
- `POST {bff}/xCACcore/v1/customerInteraction`, body = collection shape: `journeyId:
  "monetaryRecharge"`, `type:"PurchaseOrder"`, `journeyData.msisdn`,
  `journeyData.monetaryRechargeDetails {amount, unit}`, `journeyData.payment {merchantRefNum=
  paymentId, paymentGwTransactionId=authorizationCode, …}`, with `customerId` + `contractId`. Parse
  `{ partyInteractionId }`. Capture (call 3) MUST precede the journey (DXP rule).

### 5. Recharge BFF — `src/routes/bff.recharge.$.tsx` + `src/services/bff/recharge-proxy.ts`
- New server route mirroring `bff.cpr.$.tsx`'s shape; logic in `services/bff` for unit-testability.
- **Its own allowlist** (the CPR BFF's is hardcoded to `/customerManagement/v1/`): exactly
  `POST payment/v4/payment` and `POST xCACcore/v1/customerInteraction`; else 404.
- **Token (Req 3.3) — D-recharge-token:** the recharge calls use the Keycloak token (collection) /
  CBEV client-credentials, NOT the CPR static Bearer. Decision for THIS spec: the BFF reads a
  server-only `RECHARGE_TOKEN` (Worker env, non-VITE) and injects it — the SAME static-token shape
  as the CPR BFF, so the fake accepts it. The REAL token acquisition (client-credentials grant +
  refresh/expiry, "ours to add" per the doc) is a recorded follow-up: wiring a grant+cache into the
  BFF is its own concern, not blocking the fake-level flow. Reuse `bff-env.serverEnv` verbatim.
- Forward base differs per path (`/payment/v4` vs `/xCACcore/v1`) — the recharge BFF forwards the
  full sub-path to `${RECHARGE_BASE_URL}/<subPath>` (no single hardcoded prefix like CPR).
- No body logging (payment refs/PII).

### 6. Fake — extend `tools/cpr-fake` (Req 5.1)
- `POST /payment/v4/payment` → `201 { id: pay-fake-<n>, authorizationCode: AUTH-<n>,
  transactionDateTime, status:"SUCCESS", amount }`. Track used authorizationCodes; a reused one →
  `{ code:33028 }` (so the conflict path is testable).
- `POST /xCACcore/v1/customerInteraction` → `200 { partyInteractionId: PIN-fake-<n> }` (require
  journeyId, customerId, contractId; missing → envelope). CORS already added (Phase 1).

### 7. Config / env
- Charging http flag is `VITE_ECEV_DRIVER` (existing). Payment is `VITE_PAYMENT_DRIVER`. Recharge
  goes through the charging seam's new op, so `VITE_ECEV_DRIVER=http` drives it. Server-only vars:
  `RECHARGE_BASE_URL`, `RECHARGE_TOKEN` (+ reuse the tenant resolution if the journey needs it).
- The no-client-token rail generalizes: a `VITE_*_TOKEN` for any real-able seam should throw —
  extend the existing CPR rail to cover recharge, OR keep the token names non-VITE by convention
  and document it. Decide in implementation.

### 8. Tests
- Contract tests (injected fetch): payment call fidelity + mapping (id/authorizationCode, money
  decimal↔minor), the 33028 conflict; journey call fidelity + partyInteractionId; the recharge BFF
  allowlist + token injection (parallel to cpr-proxy.test.ts). Never env-flip.
- Mock recharge test: `api.recharge` mock credits the balance + returns a partyInteractionId.
- Full suite + mock-default `runTopUp`/auto-top-up tests stay green.

## Data flow (http recharge)
1. `runTopUp` (http path) → `api.recharge({ customerId, contractId, communicationId, amountMinor,
   methodToken })`.
2. driver → BFF `POST /payment/v4/payment` → `{ paymentId, authorizationCode }` (direct capture).
3. driver → BFF `POST /xCACcore/v1/customerInteraction` monetaryRecharge (with the refs) →
   `{ partyInteractionId }`.
4. driver → `getBalance(customerId)` → Balance (or mock balance) → returns `{ partyInteractionId,
   balance }` → `TopUpResult`.

## Decisions & debts
- **D-recharge-op (A):** one new `charging.recharge` seam op owns the two-call flow; mock unchanged.
- **D-recharge-token:** BFF injects a server-only static `RECHARGE_TOKEN` for the fake; the real
  client-credentials/Keycloak grant + refresh is a follow-up (the doc's "ours to add").
- **D-credit-no-balance:** balance via follow-up getBalance, not the journey response.
- **D-contractId-source:** caller passes contractId (onboarding has it); returning-customer lookup
  is a follow-up.
- **Debt — no cross-step compensation:** a captured payment + failed journey leaves a paid-but-not-
  credited state against the fake (resettable); real saga/refund is out of scope.
- **Debt — no recurring scheduler:** auto-top-up still has only a DEV trigger; a real recurring
  recharge (CBEV expiry-driven) is a separate concern.
- **Debt — medium-confidence shapes:** payment/journey bodies reconciled at cluster cut-over.

## Out of scope
Real money; real cluster; the client-credentials token grant; refunds/voids; the recurring
auto-recharge scheduler; the returning-customer contract lookup.
