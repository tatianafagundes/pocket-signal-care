# CPR http integration — detailed build plan (fake server + onboarding first)

**Status:** PLAN (no integration code written yet). Approved direction: build the real `cpr` http
driver against a **local fake server** + contract tests, onboarding first, with the mock as the
default fallback and the demo path untouched. Auth/BFF come later. **JXC out of scope.**

Read first: `2026-11-13-cpr-integration-readiness.md` (why/what), `postman/response-shapes.md`
(real bodies), `src/services/README.md` (seam rules), `postman/Multi-tenant-customer.postman_collection.json`.

This plan is deliberately granular so each increment is small, verifiable, and reversible, and so
nothing touches real money or the working demo until we choose to flip an env flag.

---

## 0. Ground truth (verified in code, 2026-11-13)

- **Seam swap is env-only.** `driverFor("cpr")` returns `"http"` iff `VITE_CPR_DRIVER=http`
  (`driver-config.ts:35`). Driver is resolved once at module load (`cpr.functions.ts:32`).
- **Fail-fast IS wired.** `getRouter()` calls `assertDriverConfig()` (`router.tsx:10`), which
  throws if a seam is `http` but its `REQUIRED_HTTP_ENV` is missing. For CPR that's
  `VITE_CPR_BASE_URL` + `VITE_CPR_TOKEN` (`driver-config.ts:70-72`). So flipping CPR to http
  without config fails loudly at boot — good.
- **`cpr-http.ts` today:** `request()` helper already does base URL + `Authorization: Bearer` +
  `X-Tenant-Id` + 10s timeout + SeamError mapping. `resolveTenant`/`createParty`/`createCustomer`
  are scaffolded but point at **wrong paths** (`/tmf-api/party/v5/...`). `getCustomerAndParty`,
  `createInteraction`, `listInteractions` are hard-`notConfigured`. Mappers (`toTmf*`/`fromTmf*`)
  are the only place TMF shapes live.
- **CprDriver interface** (`cpr-driver.ts:15-33`): resolveTenant, createParty, createCustomer,
  getCustomerAndParty, createInteraction, listInteractions. **No contract method, no Contract type,
  no contract schema anywhere.**
- **Onboarding CPR order** (`onboarding-submit.ts`): createParty → createCustomer → (order) →
  createInteraction. A contract step, if required, is a new "step 3b" after createCustomer.
- **Recharge** = payment seam (`authorize`→`capture`, both `notConfigured` http) + charging
  `topUp` (`notConfigured` http), orchestrated by `runTopUp` (`topup-payment.ts`).
- **BFF pattern exists:** TanStack Start file-route `server.handlers.ANY` (see `routes/mcp.ts`).
  A proxy route can live there later. ⚠️ CSRF middleware only guards `serverFn`, not
  `server.handlers` — relevant when we proxy writes.
- **Test convention:** test through public seam fns against the driver, assert on the SeamResult
  union (`.ok`, `.error.category`/`.code`), use `forceError` for degradation. Driver is chosen at
  import, so to test the http driver, either set env before import or construct `createCprHttp()`
  directly.

---

## 1. Decisions to lock before any code (OPEN — need your call)

These shape the increments. I will NOT start coding until these are answered, because they change
the schema/model surface.

**D1 — Contract step: in scope now, or later?**
The collection creates a `contract` (prepaid) and the recharge references `contractId`. Our app has
no contract concept. Options:
- (a) **Add it now** as part of onboarding http: new `CprDriver.createContract`, schema, model
  type `Contract`, `api.createContract`, and a step 3b in `onboarding-submit`. Bigger surface, but
  recharge needs `contractId`, so it's required eventually.
- (b) **Defer** contract + recharge to a later phase; do onboarding party+customer first, get that
  solid end-to-end against the fake, then add contract + recharge.
- **My recommendation: (b)** — smaller first increment, proves the whole http+fake+test+env machine
  on the two simplest calls (party, customer) before taking on contract/recharge. Contract lands in
  the phase that also does recharge (they're coupled by `contractId`).

**D2 — Brand → DXP tenantId mapping.**
`X-Tenant-ID` must be a `TEN…` id, not our brand slug (`drei`/`dreigo`). Need the real mapping
(e.g. `drei → TEN100000200008`). Until known, the fake server accepts any tenant and we use a
placeholder env (`VITE_CPR_TENANT_DREI=TEN_FAKE`). **Blocker only for the real cluster, not the fake.**

**D3 — Where the fake server lives + how it runs.**
Recommendation: a standalone tiny Node HTTP server under `tools/cpr-fake/` (no new runtime dep —
Node's built-in `http`), started with its own script (e.g. `bun run cpr:fake`), listening on a
fixed port (e.g. 8787). NOT part of the app build, NOT shipped. The app points at it via
`.env.local` (`VITE_CPR_DRIVER=http`, `VITE_CPR_BASE_URL=http://localhost:8787`, `VITE_CPR_TOKEN=fake`).
Mock stays the committed default (`.env.local` is gitignored), so the demo and CI are unaffected.

**D4 — Contract tests: how to assert request fidelity.**
The fake server records the requests it receives; the contract test drives `createCprHttp()`
directly (bypassing the module-load driver pin), calls each method, and asserts (1) the fake got
the exact path/headers/body the collection sends, and (2) the driver parses the documented response
into the right domain shape. Uses the repo's SeamResult assertions. No global fetch mock.

---

## 2. Phase A — Onboarding (party + customer) against the fake. SMALLEST FIRST.

Goal: prove the entire machine (http driver + fake + contract tests + env flip + fail-fast) on the
two simplest, money-free calls. Nothing here touches payment or the demo defaults.

**A1. Fake server skeleton** (`tools/cpr-fake/server.mjs` + `package.json` script).
- Node `http` server on :8787. Routes from the collection: `POST /auth/realms/dxp/.../token`
  (returns `{access_token:"fake",expires_in:300,token_type:"Bearer"}`), `POST /customerManagement/v1/party`
  (returns `{id:"<uuid>"}`), `POST /customerManagement/v1/customer` (`{id:"<uuid>"}`),
  `GET /customerManagement/v1/customer/{id}` (the documented GET shape),
  `GET /customerManagement/v1/customerview/{id}` (customer360 read shape).
- Validates presence of `X-Tenant-ID` + `Authorization`, echoes a request log to an in-memory ring
  the contract tests can read (or writes last-request to a header/endpoint). Deterministic ids.
- Verify: `curl` each route by hand; document the commands in `tools/cpr-fake/README.md`.
- **Zero app change. Not committed to the demo path.** Commit as tooling.

**A2. Fix `cpr-http.ts` paths + mappers for party/customer** (the FASE-8 edit).
- `createParty`: `POST /customerManagement/v1/party`; `toTmfParty` → the collection's body shape
  (type Individual, partyNames, contactMedia email/phone, …); `fromTmfPartyCreate` reads `.id`.
- `createCustomer`: `POST /customerManagement/v1/customer`; `toTmfCustomer` → `{engagedPartyId,
  engagedPartyType, statuses, customerType, …}` (collection body); `fromTmfCustomerCreate` reads `.id`.
- `getCustomerAndParty`: implement → `GET /customerManagement/v1/customerview/{id}` (or customer +
  party), map to `{customer, party}` domain types. (Needed by `getCustomer360`.)
- `resolveTenant`: `GET /customerManagement/v1/...` — low priority; the demo resolves tenant via
  mock; keep scaffold but don't block on it.
- Error envelope: parse `{code,reason,message}` in `request()` → SeamError category
  (4040/4041→conflict or rejected, 5xxx→unknown, 404→notFound). Keep never-throw.
- **No interface/schema change** (party/customer already exist). Only `cpr-http.ts` edits.

**A3. Contract tests** (`src/services/cpr/cpr-http.contract.test.ts`).
- Spin the fake (or point at a recorded fixture — decide in D4), construct `createCprHttp()` with
  test env, call createParty/createCustomer/getCustomerAndParty, assert request fidelity + response
  mapping + SeamError on a simulated 4041.
- Run in the normal `bun run test` suite (mock default elsewhere stays green).

**A4. Verify + document + commit.**
- `bun run build && npx tsc --noEmit && bun run test && bun run lint` (lint baseline).
- Update `response-shapes.md` if the fake revealed a shape nuance.
- Manual end-to-end: `.env.local` → `VITE_CPR_DRIVER=http` + fake running → run the onboarding
  flow in the dev server → party+customer created against the fake, rest of the flow still mock.
  (Capture if useful.) Then revert `.env.local` so the committed default stays mock.
- Commit `feat(cpr): real party+customer http driver + fake server + contract tests`.

**Exit criteria for Phase A:** with `VITE_CPR_DRIVER=http` + fake, onboarding creates party and
customer via real HTTP shapes; with the flag unset, the demo is byte-for-byte unchanged; fail-fast
throws if http is selected without config; contract tests green.

---

## 3. Phase B — Contract + Customer360 read (depends on D1)

Only if D1=(a) now, or when we reach it. Adds:
- `Contract` model type (`model.ts`), `createContractSchema` (`schemas/cpr.ts`),
  `CprDriver.createContract`, mock + http (`POST /customerManagement/v1/contract`, read `.id`,
  carry `communicationId`), `api.createContract`, and step 3b in `onboarding-submit`
  (after createCustomer, before order).
- Flesh out `getCustomerAndParty`/customer360 read against the real `customerview` shape.
- Contract tests + verify + commit.

---

## 4. Phase C — Recharge (payment + monetaryRecharge) against the fake

- Fake routes: `POST /payment/v4/payment` (`{id, authorizationCode, status, paymentDate, …}`),
  `POST /xCACcore/v1/customerInteraction` (monetaryRecharge → `{partyInteractionId}`).
- `payment-http.ts`: implement `authorize`/`capture` → `POST /payment/v4/payment`. ⚠️ Per the DXP
  doc, `/payment/v4/payment` is a **direct capture** that rejects a reused `authorizationCode`
  (error 33028). Reconcile our authorize→capture two-step with the real one-POST capture: likely
  `authorize` = build+hold the intent locally, `capture` = the single POST. Decide and document.
- `charging-http.ts` `topUp`: the credit is the `xCACcore/.../customerInteraction` monetaryRecharge
  journey (references paymentId + authorizationCode + contractId + msisdn). Map `runTopUp`'s credit
  step onto it. Preserve the honesty locks (preview==backend, real reference on the receipt).
- Needs `contractId` + `communicationId` (so depends on Phase B).
- Contract tests + verify + commit.

---

## 5. Phase D — Auth (Keycloak) + BFF (token off the client)

- Today the http token is a `VITE_CPR_TOKEN` (ships to the browser — only acceptable against the
  local fake). For the real cluster: a TanStack Start `server.handlers` proxy route
  (`routes/api/cpr/$.ts` style) holds the token + injects `X-Tenant-ID` + forwards; `*-http.ts`
  base URL points at the BFF, not the cluster. Keycloak `dxp-frontend` flow for the user session.
- CBEV charging uses OAuth2 client-credentials (different from the static Bearer) — handle in the BFF.
- This is the gate before ANY real-cluster traffic. Until then, everything runs against the fake.

---

## 6. Guardrails (hold across all phases)

- **Mock stays the committed default.** Real http is opt-in via gitignored `.env.local`. CI + demo
  never hit http. (`driver-config` default is mock; `.env.example` documents the flags.)
- **Smallest correct change per increment**, each with build+tsc+test+lint green and a commit.
- **No real money / no real cluster** until Phase D (auth+BFF) AND someone with access flips the
  real env. The fake is the only endpoint before that.
- **TMF shapes live only in `*-http.ts` mappers.** UI/types/rules/functions untouched by the swap.
- **Honesty locks** from the top-up/auto-top-up docs carry into the real recharge.
- Each phase updates the readiness doc's status + any shape corrections in `response-shapes.md`.

---

## 7. What I need from you to start Phase A

1. **D1**: contract now (a) or defer (b)? (I recommend b — party+customer first.)
2. **D3**: ok to add a `tools/cpr-fake/` Node server + a `bun run cpr:fake` script (tooling only,
   not shipped)? 
3. Anything you want different in the increment boundaries before I touch code.

Once you confirm, Phase A1 (fake server) is the first commit — pure tooling, zero app/runtime change.
