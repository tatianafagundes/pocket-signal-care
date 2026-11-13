# Design — CPR http integration (onboarding: party + customer + contract)

## Overview

Wire the real DXP CPR onboarding calls behind the existing `cpr` http driver, validated against a
local fake server. Add `contract` as a first-class CPR concept (model + schema + driver method +
onboarding step). Nothing about the seam contract the UI sees changes; the swap is env-only and the
mock stays default. TMF/REST shapes live only in `cpr-http.ts` mappers.

This design is deliberately minimal (smallest correct change) and additive: new files for the fake
server and contract tests; surgical edits to `model.ts`, `schemas/cpr.ts`, `cpr-driver.ts`,
`cpr-mock.ts`, `cpr-http.ts`, `cpr.functions.ts`, `api.ts`, `onboarding-submit.ts`.

## Steering / conventions honored

- Seam never throws → `SeamResult<T>`; the only throw boundary is `api.ts unwrap` → `SeamFailure`.
- TMF shapes ONLY in `*-http.ts` mappers. UI imports only `{ api, SeamFailure }`.
- Money in minor units; ISO dates. (Contract has no money field; amounts stay in charging/payment.)
- Smallest correct change; match existing file/style; no new runtime dependency.

## Architecture

```
onboarding-submit.ts ── api.createParty / createCustomer / createContract / createInteraction
        │                         │
        ▼                         ▼
   (idempotent steps)      cpr.functions.ts  ── validate (zod) → runWrite/runRead → driver
                                   │
                 driverFor("cpr") ─┤── mock: cpr-mock.ts   (committed default)
                                   └── http: cpr-http.ts   (VITE_CPR_DRIVER=http)
                                              │  request() → fetch(baseUrl + path, Bearer, X-Tenant-Id)
                                              ▼
                                    tools/cpr-fake (local)   ← this spec's only endpoint
```

## Components & changes

### 1. Domain model — `src/services/model.ts` (additive)
Add:
```ts
export type ContractStatus = "active" | "inactive";
export interface Contract {
  contractId: string;
  customerId: string;
  /** The MSISDN the contract is keyed by (links contract ↔ payment ↔ recharge). */
  communicationId: string;
  paymentContext: "PREPAID";
  status: ContractStatus;
  externalId?: string;
}
```
Rationale: matches the real contract GET shape in `response-shapes.md` (`id`, `customerId`,
`communicationId`, `paymentContext:"PREPAID"`, `statuses[]`), reduced to what the app needs now.
Status is normalized to `active|inactive` (real sends `ContractActive`/`ContractInactive` in a
`statuses[]` array — the mapper collapses it).

### 2. Schema — `src/schemas/cpr.ts` (additive)
```ts
export const createContractSchema = z.object({
  tenantId: tenantIdSchema,
  customerId: customerIdSchema,
  communicationId: z.string().trim().min(1),
  paymentContext: z.literal("PREPAID").default("PREPAID"),
});
export type CreateContractInput = z.infer<typeof createContractSchema>;
```

### 3. Driver interface — `src/services/cpr/cpr-driver.ts` (additive)
Add to `CprDriver`:
```ts
createContract(input: CreateContractInput): Promise<SeamResult<{ contractId: string }>>;
```
Import `CreateContractInput` from `@/schemas/cpr`; re-export `Contract` alongside `Customer, Party`.

### 4. Mock driver — `src/services/cpr/cpr-mock.ts` (additive)
Implement `createContract`: deterministic id `contract-<8hex>`, stored in a module-level
`contracts: Map<customerId, Contract>` (mirrors existing `pendingParties`/`store` style), returns
`ok({ contractId })`. Requires the customer to exist first (else `err(cpr.customer.notFound)`),
matching the createCustomer-requires-party guard already there. No behavioural change to other ops.

### 5. HTTP driver — `src/services/cpr/cpr-http.ts` (the core edit)
- **Fix paths** (Req 2.7): party `POST /customerManagement/v1/party`; customer
  `POST /customerManagement/v1/customer`; (remove `/tmf-api/party/v5/...`).
- **Add** `createContract` → `POST /customerManagement/v1/contract`, body `toTmfContract(input)`,
  parse `fromTmfContractCreate(json).id` → `{ contractId }`.
- **Implement** `getCustomerAndParty` → `GET /customerManagement/v1/customerview/{id}` →
  `fromTmfCustomerView(json)` → `{ customer, party }`. (If customerview's shape proves awkward
  against the fake, fall back to customer GET + party GET; decide during Task implementation and
  record it.)
- **Mappers (new/edited), the only place TMF lives:**
  - `toTmfParty(input)` → `{ type:"Individual", partyNames:[{givenName,familyName}], contactMedia:[email(,phone)], … }` (collection body, trimmed to what the fake needs).
  - `fromTmfPartyCreate(json)` → `{ partyId: json.id }` (already exists; keep).
  - `toTmfCustomer(input)` → `{ engagedPartyId: input.partyId, engagedPartyType:"Individual", statuses:[{status:"CustomerCreated",…}], customerType:"Residential" }`.
  - `fromTmfCustomerCreate(json)` → `{ customerId: json.id }` (keep).
  - `toTmfContract(input)` → `{ customerId, communicationId, paymentContext:"PREPAID", statuses:[{status:"ContractActive",validFor:{start:now}}] }`.
  - `fromTmfContractCreate(json)` → `{ contractId: json.id }` (throw if id missing, like the others).
  - `fromTmfCustomerView(json)` → `{ customer: Customer, party: Party }` collapsing `statuses[]`→status and reading party names/contact media.
- **Error envelope** (Req 2.6): in `request()`, on `!res.ok`, try to parse `{ code, reason, message }`;
  map by http status + code to `seamError(\`cpr.http.<code|status>\`, category, nextAction, message)`:
  - 404 → `notFound`/`contactSupport`
  - 409 or body code 4041 → `conflict`/`fixInput`
  - 4040 (party not active) / 5031/5032 → `rejected`/`fixInput`
  - other 4xx → `rejected`; 5xx / network / timeout → `unavailable`/`retry` (as today).
  Keep never-throw and the mapper-throw → `cpr.http.badResponse` path.
- **Tenant id** (Req 6.4): `X-Tenant-Id` currently sends the brand slug. Add a brand→DXP-tenant
  resolver reading `VITE_CPR_TENANT_<BRAND>` with a `TEN_FAKE` placeholder; the header value becomes
  the resolved DXP id (fake accepts any). Documented as a placeholder debt.

### 6. Seam functions — `src/services/cpr.functions.ts` (additive)
Add `createContract(input)`: `createContractSchema.safeParse` → on fail
`Promise.resolve(err(seamError("cpr.createContract.invalid","validation","fixInput")))` → on ok
`runWrite({ tenantId: parsed.data.tenantId }, "cpr.createContract", () => driver.createContract(parsed.data))`.
Mirrors `createParty`/`createCustomer` exactly.

### 7. API port — `src/services/api.ts` (additive)
`createContract: (input: unknown) => unwrap(cpr.createContract(input))` next to the other cpr entries.

### 8. Onboarding wiring — `src/lib/onboarding-submit.ts` (surgical)
Insert a new step **after createCustomer (step 3), before the order block (step 5)**:
```ts
// 3b. Contract (prepaid) — created before order items so the contract exists for fulfilment and
//     is referenced by the recharge later. Idempotent on state.contractId.
let contractId = state.contractId;
if (!contractId) {
  onStep("createContract");
  const c = await api.createContract({
    tenantId: tenant,
    customerId,
    communicationId: state.reservedMsisdn ?? "",   // MSISDN reserved earlier
    paymentContext: "PREPAID",
  });
  contractId = c.contractId;
  patch({ contractId });
}
```
- Add `"createContract"` to the `SubmitStep` union and an i18n progress key
  `onboarding.review.progress.createContract` (both locales, keep parity) — the review button
  already renders the live step, so this surfaces as "Setting up your contract…" (copy TBD).
- Add `contractId?: string` to onboarding state + persistence (mirror `interactionId`/`orderId`).
- Guard: if `state.reservedMsisdn` is absent, the contract step still runs with empty
  communicationId against the fake, but a real contract needs the MSISDN — record as a precondition
  (onboarding reserves the number before review, so it's present in practice).
- Failure path: a thrown `SeamFailure` from `api.createContract` is caught by the existing
  `confirm()` try/catch in `review.tsx` → terminal error (no silent success).

### 9. Fake server — `tools/cpr-fake/` (new, tooling only)
- `tools/cpr-fake/server.mjs`: Node `http` server, port from `CPR_FAKE_PORT` (default 8787).
  Routes per Req 4.1. Validates `X-Tenant-ID` + `Authorization` (else 401 with the error envelope).
  Deterministic ids (`party-fake-<n>`, `cust-fake-<n>`, `contract-fake-<n>`). Keeps an in-memory
  ring of the last N requests; exposes `GET /__debug/last` for the contract tests (Req 4.5).
  Responses exactly per `response-shapes.md`.
- `tools/cpr-fake/README.md`: curl examples; how to run; what each route returns.
- `package.json` script: `"cpr:fake": "node tools/cpr-fake/server.mjs"`. No new dependency.
- NOT imported by the app; NOT in the build.

### 10. Contract tests — `src/services/cpr/cpr-http.contract.test.ts` (new)
- Construct `createCprHttp()` directly with a test config (base URL = the fake, token = "fake").
  Options: (A) start the fake in a test `beforeAll` via `child_process` and hit it over HTTP, or
  (B) a thin fetch shim that replays `response-shapes.md` fixtures and records the request. Pick (A)
  if it's reliable in CI; else (B). Decide in the task and document.
- Assert, per method: request path, method, headers (`X-Tenant-Id` resolved, `Authorization`
  Bearer), body shape; and the parsed domain result (`partyId`/`customerId`/`contractId`/
  `{customer,party}`). Assert a 4041 response → `SeamError` category `conflict`.
- Keep the existing `cpr.functions.test.ts` (mock) untouched and green.

### 11. Config docs — `.env.example` (additive)
Document `VITE_CPR_DRIVER`, `VITE_CPR_BASE_URL`, `VITE_CPR_TOKEN`, and
`VITE_CPR_TENANT_DREI`/`VITE_CPR_TENANT_DREIGO` with the `TEN_FAKE` placeholder + a note that the
real map is a follow-up.

## Data flow (onboarding, http)

1. `authorizePayment` (payment seam — unchanged, still mock/notConfigured in this spec).
2. `createParty` → fake `POST /party` → `{id}` → partyId.
3. `createCustomer(partyId)` → fake `POST /customer` → `{id}` → customerId.
4. **`createContract(customerId, msisdn)` → fake `POST /contract` → `{id}` → contractId.** (NEW)
5. order block (mock), then `createInteraction` (mock/http per flag), then capture/topUp/grant
   (payment+charging seams — still mock in this spec).

> Note: payment/charging stay mock in this spec, so with `VITE_CPR_DRIVER=http` alone, onboarding
> creates party/customer/contract against the fake while money + order + balance remain mock. That
> is the intended, honest partial state for Phase A/B.

## Error handling

- Validation (zod) → `validation`/`fixInput`, synchronous, before any fetch.
- HTTP non-2xx → parsed envelope → categorized `SeamError` (see §5). Never throws.
- Mapper throw (missing id) → `cpr.http.badResponse`/`unknown`/`contactSupport`.
- Network/timeout → `cpr.http.unavailable`/`unavailable`/`retry` (existing).
- Onboarding: `SeamFailure` → existing terminal-error UI; idempotent retry resumes from the last
  persisted id.

## Testing strategy

- **Contract tests** (new): http driver vs fake — request fidelity + response mapping + error mapping.
- **Seam fn tests** (existing + extend): add mock `createContract` coverage to the cpr function
  tests (mirror createParty/createCustomer).
- **Full suite**: `bun run test` stays green; mock default unaffected (Req 5.3, 6.1).
- **Manual E2E**: `.env.local` http + fake running → onboarding in dev server creates
  party/customer/contract against the fake; revert `.env.local` after.
- Verify gate each increment: build + tsc + test + lint (baseline).

## Decisions & debts (recorded)

- **D-contract-now:** contract is in scope now (stakeholder). Model/schema/driver/onboarding all gain it.
- **D-tenant-placeholder:** `X-Tenant-ID` uses `TEN_FAKE` until the real brand→TEN map arrives
  (Req 6.4). Fake accepts any tenant. Follow-up: real map.
- **D-auth-fake-token:** `VITE_CPR_TOKEN` ships to the client — acceptable ONLY against the local
  fake. Real auth + BFF (token server-side) is a later spec (Phase D). Recorded as debt.
- **D-customerview-shape:** `getCustomerAndParty` maps `/customerview/{id}`; if the shape is awkward,
  fall back to customer+party GETs. Resolve during implementation, document the choice.
- **D-recharge-later:** payment + monetaryRecharge (and the authorize/capture vs one-POST-capture
  reconciliation) are OUT of scope here; separate spec. Contract created here is what recharge will
  reference.
- **D-contract-tests-transport:** fake-over-HTTP (A) vs fetch-shim fixtures (B) — pick per CI
  reliability; document in the task.

## Out of scope (explicit)

Recharge/payment/monetaryRecharge; real Keycloak auth; the BFF/proxy; real cluster traffic; the
real brand→tenant map; `resolveTenant` real wiring (keep scaffold).
