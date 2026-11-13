# Requirements — CPR http integration (onboarding: party + customer + contract)

## Introduction

The self-care app runs on a seam layer whose `cpr` seam is mock by default and swappable to a real
HTTP driver via one env flag. This spec covers wiring the **real DXP CPR onboarding calls**
(create party → create customer → **create contract**) behind that http driver, validated against a
**local fake server** that mirrors the customer's Postman collection
(`docs/contracts/postman/Multi-tenant-customer.postman_collection.json`) and the real response
shapes captured from the official CPI docs (`docs/contracts/postman/response-shapes.md`).

Scope of THIS spec: onboarding create-party, create-customer, create-contract, and the
customer360 read (`getCustomerAndParty`), exercised against the fake. Recharge (payment +
monetaryRecharge) and real auth/BFF/cluster traffic are explicitly OUT of scope here (separate
specs). The mock stays the committed default; real http is opt-in via a gitignored `.env.local`.

Decisions locked with the stakeholder: contract IS in scope now; spec-first; brand→DXP-tenant uses
a placeholder until the real map is provided; a `tools/cpr-fake/` Node server is approved.

## Glossary

- **CPR**: DXP Customer Profile Repository (party/customer/contract store).
- **DXP tenant id**: platform id like `TEN100000200008`, sent as `X-Tenant-ID`. Distinct from the
  app's brand slug (`drei`/`dreigo`).
- **Fake server**: a local Node HTTP server mirroring the collection's requests/responses; the
  only endpoint used while the real cluster is unreachable.
- **Seam / driver**: `cpr.functions.ts` is the seam; it delegates to `cpr-mock.ts` or `cpr-http.ts`
  chosen by `VITE_CPR_DRIVER`.

## Requirements

### Requirement 1 — Contract as a first-class CPR concept

**User story:** As the app, I want a `contract` concept in the domain + seam, so that a prepaid
onboarding can create the contract the recharge flow will later reference by `contractId`.

#### Acceptance criteria
1. WHEN the domain model is read THEN it SHALL define a `Contract` type with at least
   `{ contractId, customerId, communicationId, paymentContext: "PREPAID", status, externalId? }`
   using existing conventions (ISO dates, no float money).
2. WHEN the cpr schemas are read THEN they SHALL include a `createContractSchema` validating
   `{ tenantId, customerId, communicationId, paymentContext: "PREPAID" }` and whatever the fake
   requires, rejecting empty/invalid input.
3. WHEN the `CprDriver` interface is read THEN it SHALL declare
   `createContract(input: CreateContractInput): Promise<SeamResult<{ contractId: string }>>`.
4. WHEN the mock driver runs `createContract` THEN it SHALL return a deterministic `contractId` and
   keep the demo working with no real backend.
5. WHEN `api.createContract` is called THEN it SHALL route through the seam (validate → runWrite →
   driver) and never throw (SeamResult only).

### Requirement 2 — Real HTTP onboarding calls (party, customer, contract)

**User story:** As the app with `VITE_CPR_DRIVER=http`, I want party/customer/contract created via
the real DXP REST shapes, so that onboarding works against a real CPR (proved against the fake).

#### Acceptance criteria
1. WHEN `createParty` runs on the http driver THEN it SHALL `POST /customerManagement/v1/party`
   with the collection's body shape and parse the response `.id` into `{ partyId }`.
2. WHEN `createCustomer` runs THEN it SHALL `POST /customerManagement/v1/customer` with
   `engagedPartyId` = the created partyId and parse `.id` into `{ customerId }`.
3. WHEN `createContract` runs THEN it SHALL `POST /customerManagement/v1/contract` with
   `{ customerId, communicationId, paymentContext: "PREPAID", … }` and parse `.id` into
   `{ contractId }`.
4. WHEN `getCustomerAndParty` runs THEN it SHALL read the customer + party (via
   `/customerManagement/v1/customerview/{id}` or customer+party GETs) and map to the domain
   `{ customer, party }`, so `getCustomer360` keeps working on http.
5. WHERE a TMF/REST shape is produced or parsed THEN it SHALL exist ONLY in the `toTmf*`/`fromTmf*`
   mapper functions in `cpr-http.ts` (never in the seam, rules, UI, or model).
6. WHEN any CPR HTTP call returns a non-2xx with the `{ code, reason, message }` envelope THEN the
   driver SHALL map it to a `SeamError` with an appropriate category (e.g. 4040/4041 → conflict or
   rejected, 404 → notFound, 5xxx → unknown) and SHALL NOT throw.
7. WHERE the http path for party/customer currently uses `/tmf-api/party/v5/...` THEN it SHALL be
   corrected to the real `/customerManagement/v1/...` paths.

### Requirement 3 — Onboarding wiring (contract step)

**User story:** As a user completing onboarding against http, I want a contract created in the
right place, so the account is correctly formed before order and interaction.

#### Acceptance criteria
1. WHEN `runOnboardingSubmit` runs THEN it SHALL create the contract AFTER `createCustomer` and
   BEFORE the order block, carrying the reserved MSISDN as `communicationId`. The `communicationId`
   SHALL be required: IF `state.reservedMsisdn` is absent THEN the step SHALL fail with a clear
   `SeamError` rather than send an empty `communicationId` (onboarding guarantees the number before
   review, so this is a defensive precondition, not an expected path).
2. WHEN the contract step succeeds THEN its `contractId` SHALL be persisted via `patch` and the
   step SHALL be idempotent (skipped on retry if `contractId` already present), matching the
   existing idempotency pattern of the other submit steps.
3. WHEN the contract step fails on http THEN the failure SHALL surface as the existing onboarding
   terminal/field error path (no silent success, no orphaned later steps).
4. WHEN the driver is mock (the committed default) THEN onboarding SHALL behave exactly as today,
   with the new contract step producing a mock `contractId` and not changing the demo visibly
   beyond what's intended.

### Requirement 4 — Local fake server

**User story:** As a developer without cluster access, I want a local fake CPR, so I can build and
test the http driver end-to-end without the real backend.

#### Acceptance criteria
1. WHEN the fake server is started THEN it SHALL listen on a fixed local port and serve:
   `POST /auth/realms/dxp/protocol/openid-connect/token`, `POST /customerManagement/v1/party`,
   `POST /customerManagement/v1/customer`, `POST /customerManagement/v1/contract`,
   `GET /customerManagement/v1/customer/{id}`, `GET /customerManagement/v1/customerview/{id}`.
2. WHEN a business route is called THEN the fake SHALL require `X-Tenant-ID` and `Authorization`
   headers and respond with the shapes in `response-shapes.md` (deterministic ids).
3. WHERE a header or required field is missing THEN the fake SHALL respond with the documented
   `{ code, reason, message }` error envelope and an appropriate status, so error mapping can be
   tested.
4. WHEN the fake server code is added THEN it SHALL use only the Node standard library (no new
   runtime dependency), live under `tools/cpr-fake/`, have a run script, and NOT be part of the
   app build or shipped bundle.
5. WHEN the fake records requests THEN it SHALL expose the last received request(s) to the contract
   tests (in-memory ring or a debug endpoint) so request fidelity can be asserted.

### Requirement 5 — Contract tests

**User story:** As a maintainer, I want tests that lock the http driver to the contract, so a shape
drift is caught without a live cluster.

#### Acceptance criteria
1. WHEN the contract test suite runs THEN it SHALL exercise `createParty`, `createCustomer`,
   `createContract`, and `getCustomerAndParty` on the http driver and assert both the request sent
   (path, headers incl. `X-Tenant-ID`/`Authorization`, body shape) and the parsed domain result.
2. WHEN a CPR call returns the error envelope THEN the test SHALL assert the driver returns a
   `SeamError` of the expected category/code (never throws).
3. WHEN the full test suite runs THEN all existing tests SHALL remain green and the mock-default
   behaviour SHALL be unaffected.
4. WHERE the driver is chosen at module load THEN the test SHALL construct `createCprHttp()`
   directly (or set env before import) so it tests the http driver deterministically.

### Requirement 6 — Safe, reversible, demo-preserving swap

**User story:** As the team, I want the real http opt-in to never endanger the demo, CI, or real
money, so we can develop the integration safely.

#### Acceptance criteria
1. WHEN no `.env.local` is present THEN `VITE_CPR_DRIVER` SHALL default to `mock` and the demo and
   CI SHALL be byte-for-byte unaffected by this spec.
2. WHEN `VITE_CPR_DRIVER=http` is set WITHOUT `VITE_CPR_BASE_URL` and `VITE_CPR_TOKEN` THEN the app
   SHALL fail fast at boot (existing `assertDriverConfig` via `getRouter`).
3. WHEN the http driver is active THEN it SHALL target only the configured base URL (the fake
   during this spec); NO real cluster and NO real money SHALL be reachable through this spec.
4. WHERE the DXP tenant id is unknown THEN a placeholder (e.g. `VITE_CPR_TENANT_DREI=TEN_FAKE`)
   SHALL be used and documented, and the real map SHALL be a documented follow-up, not a blocker
   for the fake.
5. WHEN each increment is completed THEN `bun run build`, `npx tsc --noEmit`, `bun run test`, and
   `bun run lint` (at the existing baseline) SHALL all pass before commit.

### Requirement 7 — Documentation & honesty

**User story:** As a future integrator, I want the divergences and decisions recorded, so the real
cluster cut-over is safe.

#### Acceptance criteria
1. WHEN this spec is implemented THEN the readiness doc and `response-shapes.md` SHALL be updated
   with any shape corrections discovered against the fake.
2. WHERE our authorize/capture model differs from the real one-POST capture, OR the brand→tenant
   map is a placeholder, OR auth token still ships to the client (fake only) THEN these SHALL be
   recorded as explicit Fase-8/next-spec debts (no silent assumptions).
3. WHEN `.env.example` is read THEN it SHALL document the CPR http flags and the tenant placeholder.

## Definition of done

This spec is DONE when ALL of the following hold, and NOTHING beyond them is claimed:

- Onboarding creates **party + customer + contract** against the local fake with
  `VITE_CPR_DRIVER=http` + a localhost base URL + the fake token.
- Contract tests (http driver vs fixtures) and the extended mock `createContract` tests are green.
- The full suite stays green and the **mock default demo is byte-for-byte unaffected** with the
  flag off (no `.env.local`).
- The debts are recorded (tenant placeholder, client-token/fake-only, customerview shape choice,
  `communicationId` format vs real cluster, contract-ownership-vs-order, no cross-seam compensation,
  recharge-later).

It is explicitly NOT done-and-shipped-to-real: **no real money, no real Keycloak auth, no real
cluster traffic** is in scope. Those are later specs (recharge, auth/BFF, cluster cut-over).
