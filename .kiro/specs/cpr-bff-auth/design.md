# Design — CPR BFF (server-side token) + real auth groundwork

## Overview

Put a same-origin **BFF proxy** between the client CPR driver and the real CPR, so the CPR token
lives server-side (Worker `env`) instead of in client JS. The client driver stops carrying the
token and points at `/bff/cpr/*`; the BFF adds `Authorization` + `X-Tenant-ID` and forwards. The
config rail flips from "token on client ⇒ localhost only" to "token must NOT be on the client".

This is the smallest change that removes the client-token problem: the CPR driver already funnels
every call through one `request()` helper, and the BFF is a single new server route. Real end-user
auth (Phase 2) is designed here but gated on a spike + customer answers — it is not built blind.

**Runtime reality (verified by context-gathering):** this app builds to a Cloudflare Worker;
`src/server.ts` is `export default { fetch(request, env, ctx) }`. There is NO `process.env`. Server
secrets must come from the Worker `env` binding. Whether a `createFileRoute(...).server.handlers.ANY`
handler can read that `env` is UNVERIFIED — hence Requirement 0 is a blocking spike.

## Architecture

```
            client (browser)                         server (Cloudflare Worker)
  ┌───────────────────────────────┐        ┌───────────────────────────────────────┐
  │ cpr-http.ts                    │        │ /bff/cpr/*  (createFileRoute server)    │
  │  baseUrl = "" (same origin)    │  POST  │  - read CPR_TOKEN + CPR_BASE_URL from   │
  │  path = /bff/cpr/<cpr-path>    │ ─────▶ │    Worker env (server-only)             │
  │  NO Authorization header       │        │  - add Authorization: Bearer <token>    │
  │  (X-Tenant-ID: see §3)         │        │  - add X-Tenant-ID (resolved)           │
  └───────────────────────────────┘        │  - allowlist the path, forward to CPR   │
                                            │  - return CPR status+body unchanged     │
                                            └──────────────────┬──────────────────────┘
                                                               ▼  real CPR (or the fake)
```

The mock driver is untouched and stays the committed default. Only the http path changes, and only
in: `cpr-http.ts` (URL/headers), a new BFF route, and `driver-config.ts` (the rail).

## Phase 1 — CPR BFF proxy

### 0. Spike (Requirement 0) — do first, record the result
Prove a server route handler can read a server-only secret not bundled into client JS. Candidate
mechanisms, in order of likelihood for this stack:
- The Worker `env` reaches the handler (via TanStack Start's server context / a `getContext`-style
  accessor, or by the start server entry threading `env`). Dev-time equivalent: `wrangler`
  `.dev.vars` or `vite` server-only (non-`VITE_`) env read in the handler at request time.
- Minimal proof: a throwaway `/bff/ping` route that returns whether a known server-only var is
  readable at request time AND a grep/build check that the value is NOT present in the client bundle.
- If NONE works from a route handler: revise (e.g. a separate tiny worker, or pause) — do not fall
  back to `process.env` (absent in this runtime) or to a client var.

### 1. BFF route — `src/routes/bff.cpr.$.tsx` (new; exact name per the spike's routing)
- `createFileRoute("/bff/cpr/$")({ server: { handlers: { ANY: handler } } })` — the catch-all
  (`$`) captures the CPR sub-path. (The two existing server routes, `mcp.ts` +
  `oauth-protected-resource.ts`, are Lovable-auto-generated and edit-protected; this is the first
  hand-authored server route, written to their `createFileRoute().server.handlers.ANY` shape.)
- Handler, per request:
  1. Resolve the CPR sub-path from the catch-all; **allowlist** it (exact set: `party`, `customer`,
     `contract`, `customerview/{id}`, method per path). Anything else → 404 (not an open relay).
  2. Read `CPR_BASE_URL` + `CPR_TOKEN` from the server-only source (per the spike). Missing →
     return the `{code,reason,message}` envelope with a 5xx so `cpr-http` maps it to `unavailable`.
  3. Build the upstream request: method + body passed through; headers = `Authorization: Bearer
     <token>`, `X-Tenant-ID: <resolved>`, `Content-Type: application/json`.
  4. `fetch` the real CPR (server-side `fetch`); return a `Response` with the upstream status + body
     unchanged. No body logging (metadata only, Req 1.5).
- CORS is NOT needed (same origin), unlike the fake. The fake stays for pure-local dev; the BFF is
  how a real CPR is reached.

### 2. CPR http driver — `src/services/cpr/cpr-http.ts` (surgical)
- `readConfig()` no longer requires `VITE_CPR_TOKEN`. New shape: `{ baseUrl, timeoutMs }` where
  `baseUrl` defaults to `""` (same-origin) or a configured BFF prefix. The token field is removed.
- `request()` drops the `Authorization` header line (the BFF adds it). Paths become
  `/bff/cpr/<cpr-path>` (prepend the BFF prefix instead of the raw CPR path).
- `X-Tenant-ID` (Req 2.2): **move it to the BFF.** The DXP tenant is a server concern and
  `resolveDxpTenant` reads a `VITE_` var today; moving it server-side keeps the brand→TEN map off
  the client too. The driver still passes the app brand (slug) to the BFF via a NON-secret header
  (e.g. `X-App-Brand`) or the path, and the BFF resolves brand→DXP tenant from server env. Decision
  recorded; the alternative (client resolves + forwards) is rejected because it keeps the map
  client-side.
- Injectable `fetch` stays — contract tests are unaffected in transport; only the asserted
  URL/headers change (no `Authorization`; same-origin path; `X-App-Brand` instead of resolved tenant).

### 3. Config rail — `src/services/driver-config.ts` (flip the invariant)
- Replace `assertCprBaseUrlIsLocal()` with `assertCprClientHasNoToken()` (or similar): the invariant
  is no longer "localhost only" but "**no CPR token on the client**". Concretely: if
  `VITE_CPR_DRIVER=http` AND `VITE_CPR_TOKEN` is set → THROW (a client token is now the mistake).
  A same-origin BFF base URL (empty or `/bff/...`) is allowed; a real CPR base URL is NOT read by
  the client at all (it moved to server env), so the client base URL is just the BFF prefix.
- `REQUIRED_HTTP_ENV.cpr` drops `VITE_CPR_TOKEN` (no longer a client requirement). The server-side
  required vars (`CPR_TOKEN`, `CPR_BASE_URL`) are validated at the BFF, not in this client-side
  assert (they aren't visible to the client).
- `warnCprActiveBrand()` — if the tenant resolution moves to the BFF, this warning moves too (or is
  dropped client-side and re-homed to the BFF's startup). Decide during implementation.
- `.env.example` updated: client gets `VITE_CPR_DRIVER=http` only; `CPR_TOKEN`/`CPR_BASE_URL`/the
  tenant map are documented as **server-only** (Worker vars / `.dev.vars`), explicitly NOT `VITE_`.

### 4. Tests
- Contract tests (`cpr-http.contract.test.ts`): update the asserted request — same-origin
  `/bff/cpr/...` path, NO `Authorization` header, `X-App-Brand` instead of resolved `X-Tenant-ID`.
  The injected-fetch transport is unchanged. The error-mapping table is unchanged (the BFF returns
  the same envelope/statuses).
- New BFF route unit test: allowlist (good path forwards; unknown path → 404), token/tenant header
  injection (assert the upstream `fetch` was called with `Authorization` + `X-Tenant-ID`), and the
  unconfigured-token → envelope path. Use an injected/stubbed upstream `fetch` so no network.
- driver-config tests: the old localhost-rail tests are replaced by "client token under http →
  throws" and "same-origin BFF base URL → ok".

## Phase 2 — real end-user auth (design only; gated)

Documented, not built (Req 4). The intended flow:
- End-user login = Keycloak **Auth Code + PKCE** (not ROPC): the SPA redirects to Keycloak, the
  code comes back to a server route, the server exchanges it for tokens and sets an **httpOnly,
  Secure, SameSite cookie** — the token is never in JS-readable state (matches session-context.ts's
  "NO TOKEN HERE" and auth-http.ts's "httpOnly cookie via a backend" note).
- The authenticated user → CPR `customerId` mapping replaces `fallbackCustomerId(tenant)` in
  `login.tsx`; the session's `customerId` becomes the real CPR id (likely resolved via a CPR lookup
  keyed on the user's identity — endpoint TBD, an open question).
- `auth-http.ts` stays a stub until the answers land; this spec does not wire Keycloak.

### Open questions for the customer (Req 4.2) — MUST be answered before Phase 2 is built
1. Is there a **non-admin end-user** realm/flow? The committed `masteradmin` + `grant_type=password`
   is admin ROPC — not an end-user login.
2. Which Keycloak **realm + client** for end users (the collection uses realm `dxp`, client
   `dxp-frontend`)? Is `dxp-frontend` a public SPA client configured for Auth Code + PKCE?
3. How is the **CPR `customerId`** obtained for a logged-in user (which endpoint maps identity → CPR
   customer)?
4. Is the **CPR service token** the same as the user token, or a separate service credential? Note
   CBEV charging uses **OAuth2 client-credentials**, distinct from the static Bearer the CPR calls
   use — the BFF may manage two token flows (recharge spec territory).

## Decisions & debts

- **D-bff-same-origin:** the client talks to a same-origin `/bff/cpr/*`; no CORS, token server-side.
- **D-tenant-on-bff:** brand→DXP tenant resolution moves to the BFF (server), off the client.
- **D-spike-first:** the Worker-`env` reachability is a blocking spike (Req 0); the design above
  assumes it passes — if not, revise before building.
- **D-phase2-gated:** real Keycloak auth is designed + questioned, not built, this spec.
- **D-rotate-secret:** the committed `Dxp_CLI@1234` is a leaked credential to rotate; never used as
  the app token.
- **Debt — CBEV client-credentials:** a second server token flow for charging is out of scope here.
- **Debt — real brand→TEN map:** still a placeholder; the BFF will read it from server env once
  provided.

## Out of scope

Recharge/payment; CBEV token flow; the real cluster cut-over; a working Keycloak login (Phase 2 is
design + questions only).
