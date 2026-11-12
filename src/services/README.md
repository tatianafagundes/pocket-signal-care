# `src/services/` — the seam layer (how the app talks to backends)

This is the **integration layer**. Every backend call the UI makes goes through here. If you are
about to wire a real system (Fase 8), read this first, then the matching contract KB in
[`docs/contracts/`](../../docs/contracts/).

> One-line mental model: **the UI imports only `{ api, SeamFailure }`. `api` calls a _seam_. A
> seam validates input, then delegates to a _driver_ (mock today, http later). Swapping mock→real
> is an env flag + one `*-http.ts` file — nothing else changes.**

---

## The flow (one picture)

```
UI (routes/components)
   │  imports ONLY { api, SeamFailure } from "@/services/api"
   ▼
api.ts ................ single port. unwrap(SeamResult) → data | throw SeamFailure
   ▼
<seam>.functions.ts ... validate input (Zod) → runRead/runWrite → pick driver
   ▼
driverFor(seam) ....... driver-config.ts reads VITE_<SEAM>_DRIVER (default "mock")
   ├── <seam>-mock.ts ... in-memory, seeded, withMock() latency + forced-error  ← demo runs on this
   └── <seam>-http.ts ... the REAL backend. TMF/REST mapping lives ONLY here      ← Fase 8 edits this
```

Rules that never bend (enforced by convention + review):
- **A seam never throws.** It returns `SeamResult<T>` (`{ok:true,data}` | `{ok:false,error}`). The
  only place a failure becomes an exception is `api.ts` (`unwrap` → `SeamFailure`).
- **The UI never imports a seam, a driver, or TMF.** Only `{ api, SeamFailure }`.
- **TMF/REST shapes live ONLY in `<seam>-http.ts`.** Not in the seam, not in a rule, not in the UI.
- **Money is minor units** (euro cents) everywhere; format by locale in the UI.

---

## Anatomy of a seam (example: `catalog`)

| File | Role |
|---|---|
| `catalog.functions.ts` | Public surface. Zod-validates input → `runRead`/`runWrite` → `driverFor("ecm")` → driver. |
| `catalog.functions.test.ts` | Tests the public surface against the mock. |
| `catalog-rules.ts` | **Pure** business rule (no I/O, no throw) — here, offer eligibility. Testable alone. |
| `catalog-rules.test.ts` | Tests the pure rule. |
| `catalog/catalog-driver.ts` | The `CatalogDriver` interface both drivers implement. The seam talks only to this. |
| `catalog/catalog-mock.ts` | In-memory driver (seeded, `withMock`). The demo default. |
| `catalog/catalog-http.ts` | The real driver. **Stub today** — returns `*.notConfigured` until wired. |

Shared infrastructure every seam uses (files directly in `src/services/`):

| File | Role |
|---|---|
| `seam-result.ts` | `SeamResult`, `SeamError`, and `seamError()` / `ok()` / `err()`. Error categories: `validation \| notFound \| conflict \| rejected \| unavailable \| unknown`. |
| `seam-runtime.ts` | `runRead` / `runWrite` — try/catch→SeamResult boundary + metadata-only logging (op, tenant, ms; **never payloads/PII**). |
| `mock-support.ts` | `withMock(op, fn)` (300–900ms latency + forced-error), `forceError` / `clearForcedError`. |
| `driver-config.ts` | The **only** place env is read for driver choice. `driverFor(seam)` + `authDriverOrThrow()`. |
| `model.ts` | Canonical domain types (Party, Customer, Offer, Balance, Session, …). The UI consumes these, never raw TMF. |
| `api.ts` | The single port. `api` object + `SeamFailure` class. |

---

## The six seams — and the name trap

| Seam (folder/files) | `driverFor()` name | env flag | Real system | Contract KB |
|---|---|---|---|---|
| `cpr` | `cpr` | `VITE_CPR_DRIVER` | DXP Customer Profile Repository | [`dxp-customer-management-cpr.md`](../../docs/contracts/dxp-customer-management-cpr.md) |
| `catalog` | **`ecm`** | **`VITE_ECM_DRIVER`** | Ericsson Catalog Manager (TMF620/679) | [`tmf620-product-catalog.md`](../../docs/contracts/tmf620-product-catalog.md), [`tmf679-po-qualification.md`](../../docs/contracts/tmf679-po-qualification.md) |
| `order` | **`eoc`** | **`VITE_EOC_DRIVER`** | Ericsson Order Care (Shopping Cart / TMF622 / TMF637) | [`shoppingcart.md`](../../docs/contracts/shoppingcart.md), [`tmf622-product-ordering.md`](../../docs/contracts/tmf622-product-ordering.md), [`tmf637-product-inventory.md`](../../docs/contracts/tmf637-product-inventory.md) |
| `charging` | **`ecev`** | **`VITE_ECEV_DRIVER`** | CBEV Charging (TMF654 Prepay Balance) | [`cbev-charging.md`](../../docs/contracts/cbev-charging.md) |
| `resource` | `resource` | `VITE_RESOURCE_DRIVER` | DSIMA (SIM/MSISDN) | — |
| `auth` | `auth` | `VITE_AUTH_DRIVER` | Keycloak OIDC (or Supabase) | — (stub documents the flow) |

> ⚠️ **Name trap:** the folder is named for the business concept (`catalog`, `order`, `charging`)
> but the driver/env name is the DXP system (`ecm`, `eoc`, `ecev`). There is no
> `VITE_CATALOG_DRIVER` — it's `VITE_ECM_DRIVER`. This mapping lives in `driver-config.ts`.

Seams that are not uniform (know before you touch them):
- **`cpr`** has `customer360-rules.ts` at the root (not `cpr-rules.ts`). `getCustomer360` is the
  only **cross-seam fan-out**: it calls `order.getInstalledBase` + `charging.getBalance` and
  composes with `composeCustomer360`. It **degrades silently** — if order/charging fail, it
  returns an empty installed base / `null` balance by design (so one outage doesn't blank the
  screen). ⚠️ When you wire real systems, a partial failure shows as "no plan / no balance" with
  no error. Decide whether that's acceptable per screen.
- **`catalog`** `qualifyOffer` also reaches into `charging.getBalance` (to flag "top up first").
- **`auth`** is the security-sensitive seam — see below.
- `order` / `charging` / `resource` have **no** `*-rules.ts` (no pure rule needed yet).

---

## How to wire a REAL system (Fase 8 playbook)

Example: turn on the real CPR. Same shape for any seam.

1. **Set env** (copy `.env.example` → `.env`):
   ```
   VITE_CPR_DRIVER=http
   VITE_CPR_BASE_URL=https://<cpr-host>
   VITE_CPR_TOKEN=<token>
   ```
   `driverFor("cpr")` now returns `"http"`, so `cpr.functions.ts` builds `createCprHttp()` instead
   of the mock. **No seam/UI code changes for the switch itself.**

2. **Edit ONE file: `src/services/cpr/cpr-http.ts`.** This is where the real REST/TMF lives:
   - Confirm the endpoint paths against the contract KB. ⚠️ The current scaffold uses generic
     `/tmf-api/party/v5/...` paths, but `docs/contracts/dxp-customer-management-cpr.md` found the
     **real DXP endpoints are `/customerManagement/v1/party`, `/customer`, `/customerview/{id}`**.
     Reconcile these before going live.
   - Complete the stubbed method(s) — e.g. `getCustomerAndParty` currently returns `notConfigured`.
   - Keep the TMF mapping in the `toTmf*` / `fromTmf*` functions at the bottom (the single place
     TMF shapes exist). They already reject an empty id rather than passing it on.
   - Auth/tenant: the `request()` helper already sends `Authorization: Bearer` + `X-Tenant-Id`.
     Note the **CBEV** seam uses **OAuth2** (client-credentials), not a static Bearer — see
     `cbev-charging.md`.

3. **Do NOT touch:** `cpr.functions.ts` (the seam), `api.ts`, `model.ts`, `seam-result.ts`,
   `seam-runtime.ts`, the rules, or the UI. The driver swap is invisible to them.

4. **Verify:** the http driver fails **safe** — if base URL/token are missing, every op returns
   `cpr.http.notConfigured` (a `SeamError`, never a crash). Wire it, then test a real call.

Per-seam env vars live (by design) inside each `*-http.ts` (`readConfig()`), with examples at the
bottom of `.env.example`. Driver choice is the only env read in `driver-config.ts`.

---

## The `auth` seam — read before integrating

Auth is the one seam with a **production fail-safe**. The mock login accepts *any* credential
(demo), so shipping it would be a security hole.

- `auth.functions.ts` resolves its driver via **`authDriverOrThrow()`**, not `driverFor("auth")`.
  In a **PROD build**, if the driver would be `mock`, it **throws at module load** — the pipeline
  MUST set `VITE_AUTH_DRIVER=http`. Protected by `driver-config.test.ts` (mutation-tested).
- The **password never leaves the seam**: validated by the pure `auth-rules.ts`, then discarded.
  It is never stored, never logged, never sent to the CPR, never in the returned `Session`.
- `Session.origin` (`mock|keycloak|supabase`) is a discriminant: a real driver must reject a
  `mock` session.
- `auth/auth-http.ts` is a stub that **documents the real Keycloak flow** (Authorization Code +
  PKCE — never ROPC). That's the Fase 8 integration point.

---

## Consuming a seam from the UI (the pattern)

> As of this writing the routes in `src/routes/` are placeholders — **no screen consumes `api`
> yet.** This is the canonical pattern to follow when they do:

```ts
import { api, SeamFailure } from "@/services/api";

try {
  const c360 = await api.getCustomer360(customerId); // returns data, or throws SeamFailure
  // render c360
} catch (e) {
  if (e instanceof SeamFailure) {
    // e.customerKey → i18n key for the message; e.retryable → show a retry;
    // e.category → 'validation' | 'notFound' | 'unavailable' | …
  }
}
```

The UI maps `SeamFailure.customerKey` / `detail` to localized copy. It never inspects raw
`SeamResult`. Every screen must handle loading / error / empty / success (see the state×screen
matrix in the onboarding spec).

---

## Where to look next
- **What each real system does + endpoints + Fase 8 debts:** [`docs/contracts/`](../../docs/contracts/) (start at its `README.md`).
- **Project-wide rules (design tokens, i18n, tenant, build):** [`AGENTS.md`](../../AGENTS.md).
- **Input validation per seam:** `src/schemas/<seam>.ts` (Zod; `tenantIdSchema` is the shared source of truth).
