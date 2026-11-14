# Tasks — real DXP recharge (payment direct-capture + monetaryRecharge)

Each task small, verifiable, ends green (`bun run build && npx tsc --noEmit && bun run test &&
bun run lint` at baseline) + a commit. Mock stays the committed default; `runTopUp`/auto-top-up
behave as today throughout. Requirement refs in (parens). We review under multiple perspectives
between tasks, as in the previous two specs.

- [ ] 0. Lock the seam-shape decision (DESIGN — already drafted in design.md, confirm before code)
  - Confirm D-recharge-op (A): a new `charging.recharge` op owns the two-call flow; the mock path
    and `runTopUp`/auto-top-up are unchanged. Confirm D-credit-no-balance, D-contractId-source,
    D-recharge-token. No code. (0.1, 0.2, 0.3)
  - _Requirements: 0.1, 0.2, 0.3_

- [ ] 1. Extend the fake with the recharge endpoints (tooling only)
  - [ ] 1.1 `tools/cpr-fake`: `POST /payment/v4/payment` → 201 { id, authorizationCode,
        transactionDateTime, status, amount }; track used authorizationCodes → reused one returns
        { code:33028 } (conflict path testable). (5.1)
  - [ ] 1.2 `POST /xCACcore/v1/customerInteraction` → 200 { partyInteractionId }; require
        journeyId/customerId/contractId, else the {code,reason,message} envelope. (5.1)
  - [ ] 1.3 Update the fake README + response-shapes.md with the exact fake shapes. Smoke with curl.
  - Verify by hand; commit (tooling).
  - _Requirements: 5.1_

- [ ] 2. Recharge domain + schema + mock op (no http yet)
  - [ ] 2.1 Add `RechargeInput` schema `{ customerId, contractId, communicationId, amountMinor,
        methodToken }` + `RechargeResult { partyInteractionId, balance|null }`. (0.1)
  - [ ] 2.2 Add `recharge` to `ChargingDriver`; implement in the mock (mint partyInteractionId,
        credit the mock balance, return balance). (0.1, 0.2)
  - [ ] 2.3 Add `charging.recharge` seam fn (validate → runWrite → driver) + `api.recharge`. (0.1)
  - [ ] 2.4 Mock recharge tests (success; missing contractId → validation). (5.2)
  - [ ] 2.5 Http charging `recharge` stub → notConfigured (wired in Task 4), to satisfy the interface.
  - Verify + commit `feat(charging): add recharge op (mock)`.
  - _Requirements: 0.1, 0.2, 5.2_

- [ ] 3. BOTH credit sites fork to recharge on the http path (mock default unchanged)
  - [ ] 3.1 `runTopUp` (or a sibling `runRecharge` if the fork is awkward — decide + document): the
        http path calls `api.recharge(...)` instead of authorize→capture→credit; mock path
        byte-for-byte unchanged. (0.2)
  - [ ] 3.2 **Onboarding first top-up (M1/D-two-credit-sites):** the credit step in
        `runOnboardingSubmit` (today `api.topUp` direct, ~line 274) ALSO branches by driver — http →
        `api.recharge({ customerId, contractId: state.contractId, communicationId:
        state.reservedMsisdn, amountMinor: planPriceMinor, methodToken })`; mock → `api.topUp`
        unchanged. If the branch duplicates runTopUp's, factor one shared helper. (0.4, 0.2)
  - [ ] 3.3 Thread `contractId` + `communicationId` from each caller into the recharge input;
        missing contractId → clear SeamError. (2.2, 0.2)
  - [ ] 3.4 Tests: mock path unchanged (existing top-up/auto-top-up AND onboarding green); unit
        tests of BOTH http forks calling api.recharge with the right input; assert onboarding http
        does NOT regress (no api.topUp on the http path). (4.1, 5.2)
  - Verify + commit.
  - _Requirements: 0.2, 0.4, 2.2_

- [ ] 4. HTTP recharge driver: payment (direct capture) + journey + money mapping
  - [ ] 4.1 Http `recharge`: `POST {bff}/payment/v4/payment` with `toTmfPayment` (minor→decimal),
        parse id + authorizationCode; 33028 → conflict SeamError (not retryable). (1.1, 1.2, 1.3)
  - [ ] 4.2 Then `POST {bff}/xCACcore/v1/customerInteraction` monetaryRecharge with
        `toTmfMonetaryRecharge` (refs threaded), parse partyInteractionId; capture precedes journey. (2.1, 2.2)
  - [ ] 4.3 Follow-up `getBalance` → return `{ partyInteractionId, balance }` (D-credit-no-balance). (0.3, 2.3)
  - [ ] 4.4 Money mapping (minor↔decimal) ONLY in the mappers; guard rounding. (1.2)
  - Verify (tsc/build/test/lint) — no runtime change with mock default. Commit.
  - _Requirements: 1.1–1.4, 2.1–2.3_

- [ ] 5. Recharge BFF (token server-side, two base paths)
  - [ ] 5.1 `src/services/bff/recharge-proxy.ts` + `src/routes/bff.recharge.$.tsx`, mirroring the CPR
        BFF shape; reuse `bff-env.serverEnv`. Its OWN allowlist: POST payment/v4/payment + POST
        xCACcore/v1/customerInteraction; else 404. (3.1, 3.2)
  - [ ] 5.2 Inject a server-only `RECHARGE_TOKEN`; forward to `${RECHARGE_BASE_URL}/<subPath>` (no
        single hardcoded prefix). No body logging. (3.2, 3.3, 3.4)
  - [ ] 5.3 Point the http recharge driver's base URL at the recharge BFF (same-origin, fixed — no
        host override, per the CPR K1 lesson). (3.1)
  - [ ] 5.4 BFF unit tests (allowlist, token injection, unconfigured → envelope) + http recharge
        contract tests (payment + journey fidelity/mapping, 33028) via injected fetch. (5.2)
  - Verify + commit.
  - _Requirements: 3.1–3.4, 5.2_

- [ ] 6. Config + env docs
  - [ ] 6.1 `.env.example`: `VITE_ECEV_DRIVER=http` to turn recharge real; `RECHARGE_BASE_URL` /
        `RECHARGE_TOKEN` documented as SERVER-ONLY (non-VITE), never client. (4.1)
  - [ ] 6.2 Generalize the no-client-token rail to recharge (a VITE_*_TOKEN for a real-able seam
        throws), or document the non-VITE convention. (3.3)
  - [ ] 6.3 Confirm no `.env.local` ⇒ mock default ⇒ demo/CI unaffected. (4.1)
  - Commit.
  - _Requirements: 3.3, 4.1_

- [ ] 7. Manual E2E through the recharge BFF + docs
  - [ ] 7.1 With the fake + BFF + `VITE_ECEV_DRIVER=http`, run a top-up in the dev browser; confirm
        payment + monetaryRecharge reach the fake via the BFF (check /__debug/last), token injected
        server-side, NO client token, balance updates. Revert config. (1.1–2.3, 4.1)
  - [ ] 7.2 Update readiness doc + response-shapes.md with any shape corrections; record the debts
        (two-token/client-credentials, no compensation, no scheduler, medium-confidence shapes). (5.1)
  - Commit `docs(recharge): real payment+journey against fake + debts`.
  - _Requirements: 5.1_

---

## Notes
- Task 0 is a confirm-the-decision gate (design already drafted). Order: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7.
- The mock `runTopUp`/auto-top-up path must stay the committed default and byte-for-byte unchanged
  on the mock driver throughout — verify that every task.
- Out of scope (separate specs / debts): real money, real cluster, the client-credentials token
  grant + refresh, refunds/voids, the recurring auto-recharge scheduler, the returning-customer
  contract lookup.
