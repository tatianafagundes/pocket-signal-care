# Tasks — CPR http integration (onboarding: party + customer + contract)

Each task is small, verifiable, and ends green (`bun run build && npx tsc --noEmit && bun run test
&& bun run lint` at baseline) + a commit. Mock stays the committed default throughout; real http is
only ever exercised locally via gitignored `.env.local` + the fake. Requirement refs in (parens).

- [ ] 1. Fake CPR server (tooling only, no app change)
  - Create `tools/cpr-fake/server.mjs` (Node `http`, port `CPR_FAKE_PORT` default 8787) serving:
    token, `POST party|customer|contract`, `GET customer/{id}`, `GET customerview/{id}`; require
    `X-Tenant-ID` + `Authorization` (else 401 + `{code,reason,message}`); deterministic ids;
    responses per `docs/contracts/postman/response-shapes.md`; keep last-N requests + expose
    `GET /__debug/last`.
  - Add `tools/cpr-fake/README.md` (curl examples, how to run) and `package.json` script `cpr:fake`.
  - Verify by hand with curl (document the commands). Commit (tooling).
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 2. Contract as a domain + schema concept (mock path, no http yet)
  - [ ] 2.1 Add `Contract` + `ContractStatus` to `src/services/model.ts`. (1.1)
  - [ ] 2.2 Add `createContractSchema` + `CreateContractInput` to `src/schemas/cpr.ts`. (1.2)
  - [ ] 2.3 Add `createContract` to the `CprDriver` interface (`cpr-driver.ts`); re-export `Contract`. (1.3)
  - [ ] 2.4 Implement `createContract` in `cpr-mock.ts` (deterministic id, `contracts` map,
        requires customer). (1.4)
  - [ ] 2.5 Add `createContract` to `cpr.functions.ts` (validate → runWrite → driver). (1.5)
  - [ ] 2.6 Add `api.createContract` to `api.ts`. (1.5)
  - [ ] 2.7 Extend `cpr.functions.test.ts` with mock `createContract` cases (success + invalid +
        customer-not-found), mirroring createParty/createCustomer. (5.3)
  - Verify + commit `feat(cpr): add contract concept (model + schema + mock driver)`.
  - _Requirements: 1.1–1.5, 5.3_

- [ ] 3. Onboarding contract step (mock default stays correct)
  - [ ] 3.1 Add `"createContract"` to the `SubmitStep` union and the progress i18n key
        `onboarding.review.progress.createContract` in `en` + `de-AT` (keep 1:1 parity). (3.1)
  - [ ] 3.2 Add `contractId?: string` to onboarding state + persistence (mirror `interactionId`). (3.2)
  - [ ] 3.3 Insert step 3b in `runOnboardingSubmit` after createCustomer, before the order block:
        `api.createContract({ tenantId, customerId, communicationId: reservedMsisdn, paymentContext:"PREPAID" })`,
        persist `contractId`, idempotent on `state.contractId`. (3.1, 3.2)
  - [ ] 3.4 Confirm failure surfaces via the existing terminal-error path (no new handling). (3.3)
  - Verify with the EXISTING onboarding unit/flow coverage; mock produces a `contractId`, demo
    unchanged beyond the intended new step. (3.4)
  - Verify + commit `feat(onboarding): create prepaid contract after customer (mock)`.
  - _Requirements: 3.1–3.4, 6.1_

- [ ] 4. HTTP driver: fix paths + party/customer/contract create + error envelope
  - [ ] 4.1 In `cpr-http.ts`, correct party/customer paths to `/customerManagement/v1/*`; update
        `toTmfParty`/`toTmfCustomer` to the collection body shapes. (2.1, 2.2, 2.7, 2.5)
  - [ ] 4.2 Implement `createContract` http (`POST /customerManagement/v1/contract`) +
        `toTmfContract`/`fromTmfContractCreate`. (2.3, 2.5)
  - [ ] 4.3 Add the brand→DXP-tenant resolver (`VITE_CPR_TENANT_<BRAND>`, `TEN_FAKE` placeholder);
        send the resolved id as `X-Tenant-Id`. (6.4)
  - [ ] 4.4 Parse the `{code,reason,message}` error envelope in `request()` and map to `SeamError`
        categories (404→notFound, 4041/409→conflict, 4040/5031/5032→rejected, 5xx/network→unavailable);
        keep never-throw + `badResponse` path. (2.6)
  - Verify (tsc/build/test/lint) — no runtime change with mock default. Commit.
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 6.4_

- [ ] 5. HTTP driver: customer360 read (`getCustomerAndParty`)
  - Implement `getCustomerAndParty` → `GET /customerManagement/v1/customerview/{id}` +
    `fromTmfCustomerView` → `{ customer, party }` (collapse `statuses[]`→status). If customerview is
    awkward against the fake, fall back to customer GET + party GET; document the choice. (2.4, 2.5)
  - Verify + commit.
  - _Requirements: 2.4, 2.5_

- [ ] 6. Contract tests (http driver vs fake)
  - [ ] 6.1 Add `src/services/cpr/cpr-http.contract.test.ts`: construct `createCprHttp()` with test
        config; decide transport (A: fake over HTTP via `child_process` in `beforeAll`; B: fetch-shim
        fixtures) by CI reliability and document. (5.4)
  - [ ] 6.2 Assert request fidelity (path/method/headers incl. resolved `X-Tenant-Id` + Bearer /
        body) and parsed result for createParty/createCustomer/createContract/getCustomerAndParty. (5.1)
  - [ ] 6.3 Assert a 4041 response maps to `SeamError` category `conflict` (never throws). (5.2)
  - Verify full suite green (mock tests unaffected). Commit.
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [ ] 7. Config, env fail-fast, docs
  - [ ] 7.1 Update `.env.example` with the CPR http flags + `VITE_CPR_TENANT_*` placeholder + note. (6.4, 7.3)
  - [ ] 7.2 Confirm fail-fast: with `VITE_CPR_DRIVER=http` and missing base URL/token, boot throws
        via `assertDriverConfig`/`getRouter` (existing) — add a test or a documented manual check. (6.2)
  - [ ] 7.3 Confirm no `.env.local` ⇒ mock default ⇒ demo/CI unaffected. (6.1, 6.3)
  - Commit.
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 7.3_

- [ ] 8. Manual end-to-end against the fake + documentation
  - [ ] 8.1 With `.env.local` (`VITE_CPR_DRIVER=http`, base URL = fake, token = fake) and the fake
        running, run onboarding in the dev server; confirm party+customer+contract created against
        the fake (check `/__debug/last`), rest of the flow still mock. Capture if useful. Revert
        `.env.local`. (2.1–2.4, 6.3)
  - [ ] 8.2 Update the readiness doc status + `response-shapes.md` with any shape corrections, and
        record the debts (tenant placeholder, client token/fake-only, customerview choice,
        recharge-later). (7.1, 7.2)
  - Commit `docs(cpr): phase A/B done against fake + debts`.
  - _Requirements: 7.1, 7.2_

---

## Notes
- Order matters: Task 1 (fake) and Tasks 2–3 (mock contract) are independent of http; Task 4+ need
  the fake to validate. Do 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8.
- Stop points are every task boundary (all green + commit). Any task can be paused/reviewed.
- Out of scope (separate specs): recharge/payment/monetaryRecharge, real Keycloak auth, BFF/proxy,
  real cluster traffic, real brand→tenant map.
