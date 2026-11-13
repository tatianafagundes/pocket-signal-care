# CPR integration — readiness & plan (onboarding + recharge)

**Status:** planning, no integration code written yet. **Audience:** whoever wires the real DXP
CPR onboarding + recharge against the shipped seam layer.

The customer gave us a Postman collection (`Multi-tenant-customer`) that creates a customer and
then recharges them against a real DXP cluster. This document records what the collection does,
how each call maps onto the app's existing seams, the gaps that need a decision before coding, and
the incremental plan. Nothing here changes runtime behaviour — the demo still runs 100% on mocks.

Anchors:
- Collection (saved in-repo): `docs/contracts/postman/Multi-tenant-customer.postman_collection.json`
- Seam layer + "wire a real system" playbook: `src/services/README.md`
- CPR KB (endpoints, fields): `docs/contracts/dxp-customer-management-cpr.md`
- xCAC KB (recharge journey orchestration): `docs/contracts/dxp-xcac-orchestration.md`
- Charging KB (CBEV balance, OAuth2): `docs/contracts/cbev-charging.md`

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

0. **Save the collection in-repo + this doc.** ← done (this commit). Zero runtime change.
1. **Connectivity spike (no app code).** From the dev machine, run the collection against the real
   `{{CLUSTER_SERVER}}` + a real `{{tenantId}}`: get a token, create party→customer→contract,
   recharge. Confirms the cluster is reachable and the prerequisites hold. Decides whether a BFF is
   mandatory (CORS) before any UI wiring.
2. **BFF/proxy decision & skeleton** (if the spike shows CORS/secret exposure): a server route that
   holds the token, injects `X-Tenant-ID`, forwards to the cluster. The `*-http.ts` base URL then
   points at the BFF, not the cluster.
3. **Auth real** (everything depends on the token): Keycloak flow in `auth` + token injection in
   `request()`.
4. **CPR onboarding http** (`cpr-http.ts`): fix paths to `/customerManagement/v1/*`, complete
   `createParty`/`createCustomer`, add `createContract`, map `getCustomerAndParty` →
   `/customerview/{id}`; thread `communicationId` + the DXP `tenantId`. Validate each against the
   collection's request/response shapes.
5. **Recharge http** (`charging-http.ts` or a new `payment` seam): `runTopUp` → `payment/v4/payment`
   + `xCACcore/.../monetaryRecharge`.
6. **Flip env per seam** with mock as fallback; keep the demo path green throughout.

---

## 6. Open questions for the customer

1. Is `{{CLUSTER_SERVER}}` + a real `{{tenantId}}` reachable from our dev machine (network/VPN)?
   Can we run the collection ourselves for the spike?
2. Is the `contract` step mandatory before recharge for prepaid, and does the app need to create it
   (vs. it existing already)?
3. Confirm the recharge model: `payment/v4/payment` first, then `xCACcore/.../monetaryRecharge`,
   with our authorize/capture mapping to "create payment".
4. Which brand(s) map to which DXP `tenantId`(s)? (the `brand → TEN…` map in gap §1)
5. For the user session, is Keycloak `dxp-frontend` the client we use, and is there a non-admin
   user/flow (the collection uses `masteradmin`, which is an admin credential, not an end user)?
