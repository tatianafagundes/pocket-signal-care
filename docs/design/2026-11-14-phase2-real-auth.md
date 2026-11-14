# Phase 2 — real end-user auth (design + open questions)

**Status: DESIGN ONLY. Not built.** This document is the deliverable of `cpr-bff-auth` Task 5. No
Keycloak login is wired; `auth-http.ts` stays a stub. Phase 2 is gated on the open questions in §4
being answered by the customer AND on a spike, exactly as Phase 1's BFF was gated on the Task 0
spike. Do not start building from this doc until those are resolved.

## Why this is design-only

The only Keycloak material we have is the Postman collection's **admin ROPC** flow: realm `dxp`,
client `dxp-frontend`, `grant_type=password`, user `masteradmin`. That is a service/admin
convenience, explicitly NOT an end-user login (the `auth-http.ts` comment already forbids ROPC for
the SPA). A real end-user flow, and the mapping from an authenticated user to a real CPR
`customerId`, depend on facts only the customer can provide (§4). Building blind would mean
inventing an auth flow — the same no-assumed-APIs line we held throughout Phase 1.

## Current state (what Phase 2 replaces)

- **`src/services/auth/auth-http.ts`** — a stub. `register`/`login`/`changeEmail` each return
  `auth.<op>.notImplemented` (category `unavailable`). The intended flow is already in its doc
  comment: login = Authorization Code + PKCE (redirect → code → token exchange), token in an
  httpOnly cookie via a backend, never ROPC.
- **`src/lib/session-context.ts`** — `SessionCustomer { customerId, email, tenantId, givenName,
  origin }`. **No token** is stored (by design); `origin` already allows `"keycloak"`.
- **`src/routes/login.tsx:76`** — stamps `customerId: fallbackCustomerId(tenant)` — a tenant-derived
  PLACEHOLDER, not a real CPR identity. This single line is the seam where the real customerId lands.
- **The BFF (Phase 1)** — already terminates the CPR *service* token server-side. Phase 2 adds the
  *user* session on top; the two token concerns are distinct (see §4 Q4).

## Intended flow (to build once §4 is answered)

### Login — Authorization Code + PKCE, httpOnly-cookie session
1. The SPA generates a PKCE verifier/challenge + `state` + `nonce`, redirects the browser to
   Keycloak's authorize endpoint (realm + client from §4 Q2).
2. Keycloak authenticates the user and redirects back to a **server route** (new, same
   `createFileRoute(...).server.handlers` shape as the BFF) with the `code`.
3. That server route exchanges `code` → tokens server-side (client secret / PKCE verifier never
   touch client JS), and sets the access/refresh token in an **httpOnly, Secure, SameSite cookie**.
   The browser never reads the token — consistent with session-context.ts's "NO TOKEN HERE" and the
   BFF's server-side-secret model.
4. The server route resolves the user's CPR `customerId` (§4 Q3) and returns the non-secret
   `SessionCustomer` to the client; `login.tsx` stops using `fallbackCustomerId(tenant)`.

### Session lifecycle
- The httpOnly cookie is the session of record; the client `SessionCustomer` is just non-secret
  identity for the UI. A `GET /bff/session` (new) reads the cookie server-side and returns the
  current `SessionCustomer` (or 401) so the SPA can restore on reload without a client token.
- Logout = a server route that clears the cookie (+ Keycloak end-session if needed) and the client
  `signOut()` (already exists) clears the local `SessionCustomer` + query cache.

### How the CPR calls change
- The CPR BFF (`/bff/cpr/*`, Phase 1) currently injects a *service* token from the Worker env. In
  Phase 2, IF the CPR accepts the end-user token (§4 Q4), the BFF reads it from the httpOnly cookie
  instead of (or in addition to) the service token. IF CPR needs a separate service credential, the
  BFF keeps using the Worker-env service token and the user cookie only gates access. This fork is
  the main §4 dependency.

## Integration points (files Phase 2 will touch — for scoping only)

- `src/services/auth/auth-http.ts` — implement `login` (PKCE initiate) + the callback/exchange;
  `register` (realm self-registration or Admin REST — §4 Q1); `changeEmail` (Admin REST).
- New server routes: the OIDC callback, `GET /bff/session`, logout.
- `src/routes/login.tsx` — replace `fallbackCustomerId(tenant)` with the resolved real customerId.
- `src/lib/session-context.ts` / `session-persistence.ts` — session restore reads the cookie via
  `/bff/session` instead of (or alongside) sessionStorage; `origin: "keycloak"`.
- `src/services/bff/*` — the CPR BFF's token source may change per §4 Q4.

## §4 — Open questions for the customer (MUST be answered before building)

1. **Is there a non-admin end-user realm/flow?** The committed `masteradmin` + `grant_type=password`
   is admin ROPC. Is there an end-user realm, and are end users provisioned there?
2. **Which realm + client for end users?** The collection uses realm `dxp`, client `dxp-frontend`.
   Is `dxp-frontend` a PUBLIC SPA client configured for Authorization Code + PKCE (not a
   confidential client, not ROPC)? If not, which client should the SPA use, and is there a redirect
   URI allowlist to register our origin in?
3. **How is the CPR `customerId` obtained for a logged-in user?** Which endpoint/claim maps an
   authenticated identity (sub / email / phone) to the CPR customer? Is it a CPR lookup, a token
   claim, or a separate identity service? This is what replaces `fallbackCustomerId(tenant)`.
4. **Service token vs user token for CPR calls.** Do the CPR calls accept the end-user access token,
   or do they require a separate service credential? Note the readiness doc records that **CBEV
   charging uses OAuth2 client-credentials**, distinct from the static Bearer the CPR calls use — so
   the BFF may need to manage two token flows (service + user), which is recharge-spec territory.
5. **Registration path.** Does the app self-register end users (Keycloak realm self-registration),
   or are accounts provisioned out-of-band (Admin REST needs admin creds the SPA must not hold)?

## Security / debts carried forward

- **ROTATE the committed credential.** `docs/contracts/postman/Multi-tenant-customer.postman_collection.json`
  contains `password: Dxp_CLI@1234` (the `masteradmin` ROPC password). It is in git history and must
  be rotated by whoever owns the cluster; it is NOT used as the app's token and must never be.
- `auth-http.ts` stays a stub until §4 is answered; `authDriverOrThrow` still forbids the mock in a
  PROD build, so a prod deploy cannot ship without a real auth driver — which is the forcing
  function for Phase 2.
- The prod-Worker secret mechanism is read-verified, not run-verified (§8/§9 of the readiness doc);
  the OIDC callback route will exercise the same Worker-env path and should be confirmed with
  `wrangler dev` / a test deploy at that time.

## Out of scope (even for Phase 2 when it is built)

Recharge (payment + monetaryRecharge); the CBEV client-credentials flow (its own spec); the real
cluster cut-over; the real brand→DXP-tenant map.
