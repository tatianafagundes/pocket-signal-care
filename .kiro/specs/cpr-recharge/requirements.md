# Requirements — real DXP recharge (prepaid top-up over http)

## Introduction

Recharge is the prepaid top-up a customer does after onboarding: pay, then credit the balance. Two
specs precede this one: onboarding wired real CPR party/customer/contract behind an http driver +
a local fake; the BFF spec moved the CPR token server-side behind `/bff/cpr/*`. Recharge is the
next business step — turning the existing mock top-up into the real DXP flow.

The customer's Postman collection recharge flow is **two calls**:
1. `POST /payment/v4/payment` (TMF676) — a **direct capture** (NOT authorize-then-capture). Returns
   `id` (paymentId) + `authorizationCode`. Rejects a reused `authorizationCode` (error 33028).
2. `POST /xCACcore/v1/customerInteraction` with `journeyId:"monetaryRecharge"` — the journey that
   actually credits the line, referencing `customerId`, `contractId`, the MSISDN, and the payment
   refs (`merchantRefNum=paymentId`, `paymentGwTransactionId=authorizationCode`). Returns
   `partyInteractionId`. **The client captures payment FIRST, then submits the journey** (DXP BUC
   `dxpBeUpfrontPaymentSupport`).

Response-shape confidence is **medium** for both (fields + TMF676 swagger; no full captured sample)
— vs high for CPR. This spec builds against a local fake + the contract, like the predecessors; the
real cluster cut-over is later.

### The structural mismatch this spec must resolve (read first)

The existing `runTopUp` (`src/lib/topup-payment.ts`) is **authorize → capture → credit**: `api.
authorizePayment` → `api.capturePayment` → `api.topUp({customerId, amountMinor})`, with an
`authorizationRef` persisted between authorize and capture for idempotent resume. The DXP flow does
NOT match:
- There is **no DXP authorize** (reserve-without-charge). `/payment/v4/payment` IS the charge.
- The **credit** is a journey needing `contractId` + MSISDN + the payment refs — none of which the
  current `api.topUp({customerId, amountMinor})` signature or `TopUpResult.balance` can carry.
- The credit response is `{partyInteractionId}`, not a `Balance` — yet `runTopUp` returns a balance.
- The DXP calls use a **different token** than the CPR static Bearer (Keycloak / client-credentials
  per the collection), so the CPR BFF cannot be cloned as-is.

So this spec is NOT "wire topUp like onboarding." It must decide how the real two-call flow lives
behind the seam WITHOUT breaking the mock `runTopUp`/auto-top-up path, which must stay the default.

### Scope

In: the real payment (direct-capture) + monetaryRecharge journey behind the http path, against a
fake, reachable via a BFF (token server-side). Out (separate specs / debts): the real cluster
cut-over; the recurring auto-top-up scheduler (there is none today — only a DEV trigger); refunds/
voids; the real brand→TEN map; full end-user auth (the BFF uses a service/Keycloak token per the
two-token decision below). Mock stays the committed default.

## Requirements

### Requirement 0 — Reconcile the seam shape with the real flow (DESIGN, do first)

**User story:** As the engineer, I must decide how the real payment+journey flow maps onto the seam
before coding, so the mock path and the real path share one honest contract.

#### Acceptance criteria
1. WHEN the design is written THEN it SHALL decide, with rationale, how the DXP two-call flow
   (direct-capture payment → monetaryRecharge journey) is represented behind the seam: whether the
   payment `authorize`/`capture` split stays (mock) with the http payment driver treating
   `/payment/v4/payment` as the capture (authorize a local no-op), OR a new recharge operation is
   introduced; AND how `contractId` + MSISDN + the payment refs reach the credit/journey step
   (today `api.topUp` carries none).
2. WHEN the design is written THEN it SHALL keep the mock `runTopUp` + auto-top-up path working and
   the committed default, with no behaviour change when the driver is mock.
3. WHERE the credit response is `{partyInteractionId}` (not a Balance) THEN the design SHALL state
   how the existing `TopUpResult.balance` contract is satisfied (e.g. a follow-up `getBalance`),
   without pretending the journey returned a balance.
4. WHERE there are TWO credit sites — `runTopUp` (standalone top-up) AND the onboarding first
   top-up, which calls `api.topUp` DIRECTLY in `runOnboardingSubmit` (not via runTopUp) — the design
   SHALL address BOTH. Turning the charging seam http (`VITE_ECEV_DRIVER=http`) must NOT regress the
   onboarding http path already shipped: the onboarding first top-up SHALL either also go through
   the recharge op (it has `state.contractId` + the MSISDN), OR be explicitly scoped out with a
   documented consequence. A recharge that silently breaks onboarding under the same flag is not
   acceptable.

### Requirement 1 — Real payment (direct capture) over http

**User story:** As the app on the http path, I want the real `/payment/v4/payment` call, so a top-up
is actually captured against DXP.

#### Acceptance criteria
1. WHEN the real payment call runs THEN it SHALL `POST /payment/v4/payment` with the collection's
   body (account.id = MSISDN, payer.id = customerId, amount {unit:"EUR", value}, the monetaryRecharge
   relatedEntity) and parse `id` (paymentId) + `authorizationCode` + `transactionDateTime`.
2. WHERE money is handled THEN the app's minor-units (euro cents) SHALL be converted to/from the
   DXP `amount {unit:"EUR", value}` decimal ONLY in the http mapper, never in the seam/rules/UI.
3. WHEN the payment is reused/duplicated (DXP error 33028, reused authorizationCode) THEN the driver
   SHALL map it to a `SeamError` (conflict/rejected) and NOT silently retry a second charge.
4. WHERE a payment succeeds but the journey later fails THEN the design SHALL state the
   (non-transactional) consequence honestly — a captured payment with no completed recharge — and
   the idempotent-resume behaviour, as a recorded debt (no cross-step compensation here).

### Requirement 2 — monetaryRecharge journey over http

**User story:** As the app, I want the real `monetaryRecharge` journey after capture, so the balance
is actually credited on DXP.

#### Acceptance criteria
1. WHEN the journey runs THEN it SHALL `POST /xCACcore/v1/customerInteraction` with
   `journeyId:"monetaryRecharge"`, `type:"PurchaseOrder"`, the MSISDN, the amount, and the payment
   refs (merchantRefNum=paymentId, paymentGwTransactionId=authorizationCode), referencing
   `customerId` + `contractId`, and parse `partyInteractionId`.
2. WHEN the journey needs `contractId` THEN it SHALL come from the contract created at onboarding
   (persisted as `state.contractId`) or a fresh contract lookup — the design SHALL specify the
   source; a missing contractId SHALL fail with a clear `SeamError`, never an empty reference.
3. WHEN the journey returns THEN the recharge SHALL be considered credited; the balance shown to the
   user SHALL be obtained per Requirement 0.3 (not fabricated from the journey response).

### Requirement 3 — Recharge BFF (token server-side, two base paths)

**User story:** As the team, I want the payment + journey calls to go through a server-side proxy,
so their token never ships to the client (same principle as the CPR BFF).

#### Acceptance criteria
1. WHEN the client makes a recharge call THEN it SHALL target a same-origin BFF path and SHALL NOT
   carry a token.
2. WHEN the recharge BFF forwards THEN it SHALL inject the DXP token server-side and forward an
   ALLOWLIST of exactly the recharge paths (`/payment/v4/payment`, `/xCACcore/v1/customerInteraction`)
   — a new allowlist, since the CPR BFF hardcodes `/customerManagement/v1/`; anything else → 404.
3. WHERE the recharge token flow differs from the CPR static Bearer (the collection uses a Keycloak
   token; CBEV charging uses OAuth2 client-credentials) THEN the design SHALL decide the token
   source and acquisition/caching, and the BFF SHALL read it server-only (Worker env), never VITE_.
4. WHERE request bodies carry PII/payment refs THEN the BFF SHALL NOT log bodies.

### Requirement 4 — Safe, reversible, demo-preserving

#### Acceptance criteria
1. WHEN no `.env.local` is present THEN payment + charging default to mock and `runTopUp`/
   auto-top-up behave exactly as today; the demo/CI are unaffected.
2. WHEN each increment completes THEN build, tsc, test, and lint (at the existing baseline) SHALL
   all pass before commit.
3. WHERE a real money path is wired THEN it SHALL reach ONLY the fake/BFF in this spec; NO real
   money and NO real cluster are in scope.

### Requirement 5 — Contract tests + fake

#### Acceptance criteria
1. WHEN the fake is extended THEN it SHALL serve `/payment/v4/payment` (returns id +
   authorizationCode; rejects a reused authorizationCode with 33028) and
   `/xCACcore/v1/customerInteraction` (returns partyInteractionId), per response-shapes.md.
2. WHEN contract tests run THEN they SHALL exercise the payment + journey http calls via injected
   fetch (fidelity + mapping + the 33028 conflict) and the recharge BFF (allowlist + token
   injection), never env-flipping; the full suite + mock default stay green.

## Definition of done

DONE when: the real direct-capture payment + monetaryRecharge journey work on the http path against
the fake, through a recharge BFF that holds the token server-side; the mock `runTopUp`/auto-top-up
path is unchanged and the committed default; the seam-shape mismatch (Req 0) is resolved honestly;
contract tests + fake + full suite green; debts recorded (two-token flow, no cross-step
compensation, no recurring scheduler, medium-confidence shapes, real cluster/money out). NOT done:
real money, real cluster, a recurring auto-recharge scheduler, refunds/voids.
