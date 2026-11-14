# CPR integration — readiness & plan (onboarding + recharge)

**Status:** planning, no integration code written yet. **Audience:** whoever wires the real DXP
CPR onboarding + recharge against the shipped seam layer.

The customer gave us a Postman collection (`Multi-tenant-customer`) that creates a customer and
then recharges them against a real DXP cluster. This document records what the collection does,
how each call maps onto the app's existing seams, the gaps that need a decision before coding, and
the incremental plan. Nothing here changes runtime behaviour — the demo still runs 100% on mocks.

Anchors:
- Collection (saved in-repo): `docs/contracts/postman/Multi-tenant-customer.postman_collection.json`
- **Real response shapes** (from Glean/CPI docs, since the collection has none):
  `docs/contracts/postman/response-shapes.md`
- Seam layer + "wire a real system" playbook: `src/services/README.md`
- CPR KB (endpoints, fields): `docs/contracts/dxp-customer-management-cpr.md`
- xCAC KB (recharge journey orchestration): `docs/contracts/dxp-xcac-orchestration.md`
- Charging KB (CBEV balance, OAuth2): `docs/contracts/cbev-charging.md`

> **Cluster not reachable from our machine** — and we don't need it to build. The Postman
> collection gives the request contracts; `response-shapes.md` gives the real response bodies
> (extracted from the official CPI docs via Glean). The http drivers + mappers are built against
> these contracts and a local fake server (plan step 1 below), behind the env flag, with mock as
> fallback. Turning on the real cluster is a one-line env change for whoever has access later.

---

## 1. What the collection does

Base URL `https://{{CLUSTER_SERVER}}`. Every business call carries `X-Tenant-ID: {{tenantId}}` and
`Authorization: Bearer {{token}}`.

**Prerequisite (customer-stated):** at least one tenant must already exist, and `{{tenantId}}`
must hold its id (e.g. `TEN100000200008`). The collection does NOT create the tenant.

**Auth** — `POST /auth/realms/dxp/protocol/openid-connect/token`
- Keycloak, realm `dxp`, `grant_type=password`, `client_id=dxp-frontend`, user `masteradmin`.
- Response `access_token` → `{{token}}` for everything else.

**Customer (onboarding)** — run in order, each stashes an id for the next:
1. `POST /customerManagement/v1/party` → `id` → `partyId`
2. `POST /customerManagement/v1/customer` (`engagedPartyId = partyId`) → `id` → `customerId`
3. `POST /customerManagement/v1/contract` (`customerId`, `communicationId`, `paymentContext:"PREPAID"`) → `id` → `contractId`
4. `GET /customerManagement/v1/contract/{contractId}`

**Recharge (top-up)** — run in order:
1. `POST /payment/v4/payment` (TMF676-ish; `account.id = communicationId`/MSISDN, `payer.id = customerId`, `amount {unit:"EUR", value}`, `relatedEntity Journey:monetaryRecharge`, `status:"SUCCESS"`) → `id` → `paymentId`, plus `authorizationCode`
2. `POST /xCACcore/v1/customerInteraction` (`journeyId:"monetaryRecharge"`, `type:"PurchaseOrder"`, references `customerId`, `contractId`, `communicationId`/msisdn, and the `paymentId`/`authorizationCode` from step 1) → applies the recharge to the Main Account wallet.

Key identifiers that thread the whole flow: `tenantId` (header), `partyId` → `customerId` →
`contractId`, and `communicationId` (the MSISDN) which links contract ↔ payment ↔ recharge.

---

## 2. How it maps onto the app's seams

| Collection call | Seam / file today | State |
|---|---|---|
| Get token (Keycloak) | `auth` (stub) + `request()` Bearer in each `*-http.ts` | helper already sends `Authorization: Bearer` + `X-Tenant-Id`; no token acquisition/refresh yet |
| Create party | `cpr-http.ts › createParty` | path is `/tmf-api/party/v5/individual` — **must become** `/customerManagement/v1/party`; `toTmfParty` mapper exists |
| Create customer | `cpr-http.ts › createCustomer` | path is `/tmf-api/customer/v5/customer` — **must become** `/customerManagement/v1/customer`; `toTmfCustomer` mapper exists |
| Create contract | — | **no contract concept in the app today**; new step needed |
| Get contract | `cpr-http.ts › getCustomerAndParty` (stub) | different shape: real `getCustomer360` reads `/customerview/{id}`, not `/contract/{id}` |
| Create payment | `charging-http.ts › topUp` (stub) / or a new `payment` seam | our `runTopUp` is authorize→capture→credit on a mock payment engine; real is a single `POST /payment/v4/payment` |
| MonetaryRecharge | same | real credit is `POST /xCACcore/v1/customerInteraction` journey `monetaryRecharge`, referencing the payment |

The seam layer is built for exactly this swap: `VITE_<SEAM>_DRIVER=http` + edit one `*-http.ts`.
The UI, `api.ts`, `model.ts`, the rules and the functions do not change.

---

## 3. Gaps & decisions (resolve before coding each step)

1. **Tenant id: brand ≠ DXP tenant.** In the app, `TenantId` is the *brand* (`"drei"` | `"dreigo"`)
   — used for theme/logo/copy. In the CPR, `{{tenantId}}` is a DXP platform id like
   `TEN100000200008` sent in `X-Tenant-ID`. These are two different things sharing a name.
   **Decision needed:** a `brand → DXP tenantId` map in config (e.g. `VITE_CPR_TENANT_DREI=TEN…`),
   resolved in `cpr-http.ts` from the active brand. Do NOT send the brand slug as `X-Tenant-ID`.

2. **Contract step is new.** The collection creates a `contract` (prepaid) between customer and
   recharge. The app's `onboarding-submit` has no contract. **Decision:** add a `createContract`
   step to `cpr` + the submit sequence (after `createCustomer`), or treat contract as owned
   elsewhere. The recharge's `customerInteraction` references `contractId`, so onboarding must
   produce one for recharge to work.

3. **`communicationId` (MSISDN) must thread through.** Contract, payment and recharge are all keyed
   by `communicationId`. In the app the number comes from the `resource` seam (DSIMA). **Decision:**
   carry the reserved MSISDN into the CPR calls (it already lives in onboarding state as
   `reservedMsisdn`).

4. **Recharge is two calls, not our three-phase engine.** `runTopUp` does authorize→capture→credit.
   Real: `payment/v4/payment` (record the payment, get `authorizationCode`) → `xCACcore/.../
   monetaryRecharge` (apply to wallet). **Decision:** map our authorize/capture onto "create
   payment" and our credit onto "monetaryRecharge"; the honesty lock (preview==backend, real
   reference on the receipt) must hold against the real `paymentId`/`authorizationCode`.

5. **Auth is real now.** `auth` is a stub today (mock accepts any credential; prod forbids mock via
   `authDriverOrThrow`). Real integration needs the Keycloak OIDC flow for the user session, and a
   way to obtain the service token the CPR calls use. Note CBEV charging uses **OAuth2
   client-credentials**, not the static Bearer — see `cbev-charging.md`.

6. **CORS / secrets / where the calls run.** The PWA runs in the browser. Calling
   `{{CLUSTER_SERVER}}` directly from the browser will almost certainly hit CORS, and would expose
   tokens in client JS. **Decision (architecture):** front the CPR with a BFF/proxy — the TanStack
   Start server routes can serve this (keep token server-side, add `X-Tenant-ID`, forward). This
   likely comes BEFORE wiring the http drivers in practice.

7. **The collection's happy path is pre-authorized.** `payment` is posted with `status:"SUCCESS"`
   and a cash-ish method; it is not a real PSP authorization/3DS. Decline/pending paths are not in
   the collection — keep the existing "4000 declines" mock discipline and treat async/declined as
   Fase 8+ until the real payment contract is confirmed.

---

## 4. Fork or branch?

**Branch, not fork.** The reason to fork would be "protect the working demo", but the seam layer
already does that better: the demo stays on mock defaults, and each seam flips to real
independently via an env flag — there is no second history to keep in sync (the real pain of a
fork). A fork only makes sense if another org owns the repo or the integration will diverge
permanently from the product; neither is true here. Use an integration branch (e.g.
`integrate/cpr-http`) and go seam-by-seam, keeping mock as the safe fallback.

---

## 5. Incremental plan (each step verifiable, mock stays default)

Cluster is not reachable, so we build against the contract (collection + response-shapes.md) and a
local fake server — not a live cluster. Recharge follows the collection's path: `payment/v4/payment`
then `xCACcore/.../customerInteraction` (monetaryRecharge). **JXC is out of scope** (the newer
orchestrator; the collection uses xCACcore directly).

0. **Save the collection + response shapes + this doc.** ← done. Zero runtime change.
1. **Local fake server + contract tests (no cluster).** A small local HTTP server that answers the
   collection's paths with the response shapes from `response-shapes.md`. Point `VITE_*_BASE_URL`
   at it. Write contract tests asserting each driver builds the exact request (path, headers, body)
   the collection sends, and parses the documented response. This is the dev/test environment for
   the integration while the cluster is closed.
2. **BFF/proxy** (the PWA can't call the cluster from the browser — CORS + token exposure): a
   TanStack Start server route that holds the token server-side, injects `X-Tenant-ID`, forwards.
   The `*-http.ts` base URL points at the BFF. (Also where the real cluster URL goes later.)
3. **Auth real** (everything depends on the token): Keycloak `dxp-frontend` flow + token injection
   in `request()`; refresh/expiry. CBEV uses OAuth2 client-credentials (different) — see KB.
4. **CPR onboarding http** (`cpr-http.ts`): fix paths to `/customerManagement/v1/*`, complete
   `createParty`/`createCustomer` (read `.id`), add `createContract` (read `.id`, carry
   `communicationId`), map `getCustomerAndParty` → `/customerview/{id}`; thread the DXP `tenantId`
   (brand→TEN… map). Parse the `{code,reason,message}` error envelope. Validate against the fake.
5. **Recharge http**: `runTopUp` → POST `/payment/v4/payment` (capture first; read id +
   authorizationCode) → POST `/xCACcore/v1/customerInteraction` monetaryRecharge (read
   partyInteractionId). Keep the preview==backend + real-reference honesty locks.
6. **Flip env per seam** with mock as fallback; keep the demo path green throughout. The real
   cluster turns on via env (base URL + token + tenant map) by whoever has access.

---

## 6. Open questions for the customer

Resolved:
- **Cluster reachability:** NOT reachable from our machine → we build against the contract + a local
  fake server; the real cluster is turned on later by whoever has access. (No longer a blocker.)
- **Recharge model / JXC:** confirmed — follow the collection (`payment/v4/payment` →
  `xCACcore/.../monetaryRecharge`), **ignore JXC**.

Still open (needed before/at the matching plan step, not before coding starts):
1. Is the `contract` step mandatory before recharge for prepaid, and does the app create it (vs. it
   existing already)? (The collection creates it; recharge references `contractId`.)
2. Which brand(s) map to which DXP `tenantId`(s)? — the `brand → TEN…` map (gap §1). Needed at
   step 4; until then the fake server accepts any tenant.
3. For the user session: Keycloak `dxp-frontend` client — and is there a non-admin end-user flow?
   The collection uses `masteradmin` (an admin credential), which is fine for the service calls but
   not for an end-user login. Needed at step 3.
4. When the cluster opens: a real `{{CLUSTER_SERVER}}` + `{{tenantId}}` and a captured set of real
   responses, so we can diff our fake's shapes against reality and adjust mappers if needed.

## 7. Phase A/B status — DONE against the fake (spec cpr-http-onboarding, 2026-11-13)

The `cpr-http-onboarding` spec is implemented and verified against the local fake. **No real money,
real auth, or real cluster** was involved — that is the honest, intended limit.

**Proven end-to-end (manual E2E, Task 8.1):** with `.env.local` (`VITE_CPR_DRIVER=http`, base URL =
the fake on 127.0.0.1, token = fake, `VITE_CPR_ACTIVE_BRAND=drei`) and the fake running, driving the
onboarding wizard in the dev server created **party + customer + contract against the fake**, in
order, through the real seam stack. The contract POST carried the real reserved MSISDN as
`communicationId` (`+4368140000001`), `paymentContext: PREPAID`, `ContractActive`, with
`X-Tenant-ID: TEN_FAKE` (the resolved DXP tenant). Seam log order confirmed:
`payment.authorize → cpr.createParty → cpr.createCustomer → cpr.createContract → …`.

**Where it stops (expected):** `cpr.createInteraction` returns `notConfigured` (interactions are
out of scope for this spec), so onboarding ends on the graceful terminal-error screen after the
contract is created. Party/customer/contract are real (fake-side); the rest is still mock. This is
the designed partial state — mixed mock/http is non-transactional (debt below).

**Fixed during the E2E:** the fake needed CORS (the app runs on another origin, the browser sends a
preflight). Added `Access-Control-Allow-Origin: *` + OPTIONS handling to `tools/cpr-fake` — local
dev only, still never-deploy.

**Debts carried into later specs (no silent assumptions):**
- Brand → DXP `TEN…` tenant map is a placeholder (`TEN_FAKE` / `VITE_CPR_TENANT_<BRAND>`).
- `VITE_CPR_TOKEN` ships to the client — fake only; real auth + BFF is a later spec. The config
  rail refuses a non-localhost base URL while the token is a client var.
- `getCustomerAndParty` stamps the tenant from `VITE_CPR_ACTIVE_BRAND` (single-brand build);
  multi-brand read would thread the tenant through the driver signature (D-360-tenant-on-http).
- `communicationId` sent as E.164; the real CPR may want a bare national number — normalize in
  `toTmfContract` once confirmed against the cluster.
- Contract fields omitted (`agreementDocumentNumber`, `externalId`, specification, characteristics).
- Contract-ownership vs the real order/cart flow (who creates the technical contract).
- No cross-seam compensation during mixed mock/http onboarding.
- `createInteraction` / `listInteractions` / `resolveTenant` on http are `notConfigured` (later specs).
- Recharge (payment + monetaryRecharge) is a separate spec; the contract created here is what it
  will reference.

## 8. BFF Worker-env spike result — PASSES (cpr-bff-auth Task 0, 2026-11-14)

Question: can a TanStack Start server route handler (`createFileRoute(...).server.handlers.ANY`)
read a server-only secret WITHOUT it being bundled into client JS, on this app's
Cloudflare-Worker (`cloudflare-module`) runtime? **Answer: yes.**

Evidence (throwaway `/bff/ping` route, since removed):
- **Dev:** the handler read `process.env.SPIKE_SECRET` (a NON-`VITE_` var). `import.meta.env`
  did NOT expose `SPIKE_SECRET` (only `VITE_SPIKE_SECRET`). Handler ctx keys:
  `request, context, params, pathname, handlerType, next` (`context` empty without middleware).
- **Client-bundle safety (the core check):** after `bun run build`, the server-only value
  (`SPIKE_SECRET`) was **NOT** found anywhere in `.output/public` (client assets); the `VITE_`
  value WAS (`.output/public/assets/index-*.js`). So a non-`VITE_` var stays off the client; only
  `VITE_` leaks. This is the invariant the BFF relies on.
- **Prod Worker mechanism (from the built `.output/server/index.mjs`):** Nitro's cloudflare preset
  wires the Worker `env` on every request: `globalThis.__env__ = env` AND
  `req.runtime.cloudflare = { env, context }`. So in the deployed Worker a handler reads a secret
  via `globalThis.__env__.CPR_TOKEN` or `request.runtime.cloudflare.env.CPR_TOKEN`; Nitro also
  polyfills `process.env` from `__env__` (why dev's `process.env` worked). NOT `process.env` as the
  Node idiom, and NEVER `import.meta.env` for a secret.

**Design implication:** the BFF route reads `CPR_TOKEN` / `CPR_BASE_URL` / the tenant map from the
Worker `env` — prefer a small server-only accessor that tries `globalThis.__env__` then
`process.env` (covers Worker + dev), reading NON-`VITE_` keys only. Secrets are set as Cloudflare
Worker vars/secrets (prod) and `.dev.vars` / shell env (dev), never `VITE_`. Task 1 can proceed.

**Confidence / what was executed vs read (honesty, H1):**
- **FACT (executed):** dev handler reads `process.env` of a non-`VITE_` var; `import.meta.env` does
  not expose it; and the built client bundle (`.output/public`) does NOT contain the server-only
  value. The security invariant — *a non-`VITE_` secret never reaches the client* — is verified by
  running the build and grepping, not inferred.
- **STRONG INFERENCE (read, not executed):** the prod-Worker mechanism (`globalThis.__env__ = env`
  + `req.runtime.cloudflare.env`, with Nitro polyfilling `process.env`) was read from the generated
  `.output/server/index.mjs`, NOT confirmed by running the Worker (`wrangler dev` could not be
  installed here — download timed out). The Nitro cloudflare preset is mature and the generated
  code is explicit, so confidence is high, but the final confirmation is a `wrangler dev` run or a
  test deploy — a follow-up, outside this environment.
- **Why this does not block Task 1:** even in the worst case (prod `process.env` behaves
  differently), the secret still stays off the client (that part IS fact), and the only change would
  be the accessor preferring `globalThis.__env__` — which the design already does. The BFF viability
  does not hinge on the unexecuted part.

## 9. BFF Phase 1 — DONE (cpr-bff-auth Tasks 1–4, 2026-11-14)

The CPR token is OFF the client. Proven end-to-end through the browser (manual E2E, Task 4.1):
with `VITE_CPR_DRIVER=http` + the fake as the BFF's upstream (`CPR_BASE_URL` set server-side only),
driving onboarding created **party + customer + contract against the fake, through the BFF**:
- `CREATED via BFF: {party:true, customer:true, contract:true}`.
- Every client `/bff/cpr/*` request carried **no token** (`Authorization: null` on all three POSTs).
- Every upstream call the fake received had `Authorization: Bearer …` (the BFF injected it) +
  `X-Tenant-ID: TEN_FAKE` (brand→tenant resolved server-side). Contract `communicationId` =
  the real reserved MSISDN (`+4368140000001`).
- The flow still stops at `cpr.createInteraction` (out of scope → notConfigured) → graceful
  terminal error; party/customer/contract are created first. Same honest partial state as before.

Client-bundle safety (Task 4.2): the server token value is NOT in `.output/public/assets`
(grepped). The only `VITE_CPR_TOKEN` reference in the client is the **safety rail** itself
(`assertCprClientHasNoToken` throwing if a client token is set) — a guard, not a token read. There
is no read of the server-only `CPR_TOKEN` in the client.

**What this does NOT cover (unchanged debts / later specs):** real end-user auth (Phase 2 is
design + open questions only — the committed Keycloak material is admin ROPC); the real brand→TEN
map (placeholder TEN_FAKE); the prod-Worker `globalThis.__env__` mechanism is read-verified not
run-verified (§8 H1, confirm with `wrangler dev` / a test deploy); recharge; the real cluster.
