# Requirements — CPR BFF (server-side token) + real auth groundwork

## Introduction

Today the CPR http driver carries `VITE_CPR_TOKEN` in client JS (see `cpr-http.ts readConfig`), so
the config rail (`assertCprBaseUrlIsLocal`) refuses any non-localhost base URL — the http path is
boxed to the local fake. This spec removes that box by introducing a **same-origin BFF
(backend-for-frontend) proxy** that holds the CPR token server-side and forwards CPR calls, and
lays the **groundwork** for a real end-user Keycloak session.

This repo runs as a **Cloudflare Worker** (`src/server.ts` is a `fetch(request, env, ctx)` entry;
there is NO `process.env` anywhere — all env today is client-bundled `import.meta.env`). So the
server-only secret must arrive via the Worker `env` binding, and the BFF must be able to reach it.

### Scope split (read this first)

This spec is deliberately **two phases**, and the second is gated on a spike:

- **Phase 1 — CPR BFF proxy (the real deliverable).** A server route that injects the CPR token +
  `X-Tenant-ID` server-side and forwards to the real (or fake) CPR; the client driver points at the
  same-origin `/bff/cpr/*` path and no longer holds the token. This removes the "token on client"
  problem for CPR and relaxes the localhost rail accordingly. **Mock stays the committed default.**
- **Phase 2 — real end-user auth (groundwork + open questions, NOT full delivery).** The committed
  Keycloak material is an admin ROPC flow (`masteradmin`, `grant_type=password`) explicitly flagged
  as NOT an end-user login. A real Auth-Code + PKCE flow with an httpOnly-cookie session, and the
  authenticated-user → real CPR `customerId` mapping, are large and depend on answers the customer
  must provide. Phase 2 here produces the **design + the open-questions list + the seam shape**,
  not a working Keycloak login, unless the spike and the answers unblock it.

Out of scope entirely (separate specs): recharge/payment; CBEV client-credentials token flow; the
real brand→DXP-tenant map; the real cluster cut-over.

## Glossary

- **BFF**: a same-origin server route (TanStack Start `createFileRoute(...).server.handlers.ANY`)
  that the client calls instead of the CPR directly; it adds the secret token + tenant header and
  forwards. The browser never sees the token.
- **Worker `env`**: the Cloudflare Worker bindings/vars object passed to `src/server.ts`'s
  `fetch(request, env, ctx)`. The only correct home for a server-only secret in this runtime.
- **ROPC**: Resource Owner Password Credentials grant — the collection's admin flow; forbidden for
  the SPA end-user login (auth-http.ts comment).

## Requirements

### Requirement 0 — Worker-env reachability spike (BLOCKING, do first)

**User story:** As the engineer, I must know whether a server route handler can read a server-only
secret before designing the BFF, so the design isn't built on an unverified assumption.

#### Acceptance criteria
1. WHEN a `createFileRoute(...).server.handlers.ANY` handler runs in this app's dev/build runtime
   THEN it SHALL be determined, with evidence, whether it can read a server-only value provided via
   the Worker `env` binding (and/or a dev-time `.dev.vars`/wrangler mechanism) WITHOUT that value
   being bundled into client JS.
2. WHEN the spike completes THEN the result SHALL be recorded (which mechanism works, with a minimal
   proof), and IF no server-only secret mechanism is reachable from a route handler THEN the BFF
   design SHALL be revised (or the spec paused) rather than assuming `process.env`.

### Requirement 1 — CPR BFF proxy route (server holds the token)

**User story:** As the app, I want CPR calls to go through a same-origin server proxy that injects
the token, so the CPR token never ships to the browser.

#### Acceptance criteria
1. WHEN the client CPR driver makes a request THEN it SHALL target a **same-origin** path
   (e.g. `/bff/cpr/<cpr-path>`) and SHALL NOT include an `Authorization` header or any CPR token.
2. WHEN the BFF route receives a `/bff/cpr/*` request THEN it SHALL read the CPR token and base URL
   from the **server-only** source (Worker `env`, never `import.meta.env`/client), add
   `Authorization: Bearer <token>` and `X-Tenant-ID: <resolved DXP tenant>`, forward to the real CPR
   base URL, and return the CPR response (status + body) to the client unchanged in shape.
3. WHEN the BFF forwards THEN it SHALL only allow the CPR paths this integration uses (party,
   customer, contract, customerview) — an allowlist, not an open proxy — and SHALL reject any other
   path with 404, so the BFF is not a general-purpose open relay.
4. WHEN the BFF cannot reach the CPR or the server token is unconfigured THEN it SHALL return a
   structured error the existing `cpr-http` error mapping already understands (the
   `{code,reason,message}` envelope or an appropriate status), so the seam surfaces a normal
   `SeamError`, never an unhandled 500 body.
5. WHERE request bodies carry PII (party name/email/MSISDN) THEN the BFF SHALL NOT log bodies
   (metadata only), matching the seam logger discipline.

### Requirement 2 — CPR http driver points at the BFF

**User story:** As the CPR http driver, I want to call the BFF instead of the CPR directly, so the
token and base URL leave the client.

#### Acceptance criteria
1. WHEN `VITE_CPR_DRIVER=http` THEN the driver SHALL build requests against the same-origin BFF path
   and SHALL NOT read or send `VITE_CPR_TOKEN`.
2. WHEN the driver builds a request THEN the `X-Tenant-ID` resolution MAY move to the BFF (preferred,
   since the DXP tenant is a server concern) OR stay client-side and be forwarded — the design SHALL
   pick one and justify it; either way the token does not.
3. WHEN the contract tests run THEN they SHALL still pass with the injectable `fetch` (the transport
   is unchanged at the test seam; only the URL/headers the driver emits change).

### Requirement 3 — Config rail updated for the new trust model

**User story:** As the team, I want the config safety rail to reflect that the token is no longer on
the client, so the rail protects the real invariant instead of a stale one.

#### Acceptance criteria
1. WHEN the CPR token is server-side (BFF) THEN the `assertCprBaseUrlIsLocal()` localhost rail
   SHALL be relaxed/replaced: a same-origin BFF path (or a configured real CPR base URL reached only
   by the server) SHALL be permitted, WHILE the rail SHALL still refuse any configuration that would
   put a token back on the client.
2. WHEN `VITE_CPR_TOKEN` is set in a build that uses the BFF THEN the config SHALL warn or throw
   (a client token is now a misconfiguration, not the normal path).
3. WHEN no `.env.local` is present THEN the mock default SHALL remain byte-for-byte unaffected.

### Requirement 4 — Real auth groundwork (design + open questions, Phase 2)

**User story:** As a future integrator, I want the real end-user auth flow designed and its open
questions surfaced, so Phase 2 can be delivered once the customer answers them.

#### Acceptance criteria
1. WHEN Phase 2 is documented THEN it SHALL specify the intended end-user flow (Keycloak Auth Code
   + PKCE, token in an httpOnly cookie set by a server route, NOT ROPC, NOT a client-stored token)
   and the authenticated-user → CPR `customerId` mapping that replaces today's
   `fallbackCustomerId(tenant)` placeholder.
2. WHEN Phase 2 is documented THEN the OPEN QUESTIONS the customer must answer SHALL be listed
   explicitly: is there a non-admin end-user realm/flow (the committed `masteradmin` is admin-only)?
   which realm/client for end users? how is the CPR customerId obtained for a logged-in user? is the
   CPR service token the same as the user token or a separate service credential (and is CBEV's
   client-credentials flow in play)?
3. WHERE Phase 2 cannot be built without those answers THEN this spec SHALL NOT fake a Keycloak
   login; the auth-http driver stays a stub until the answers + a spike unblock a follow-up.

### Requirement 5 — Safety, reversibility, demo-preserving

#### Acceptance criteria
1. WHEN no `.env.local` is present THEN every seam SHALL default to mock and the demo/CI SHALL be
   unaffected by this spec.
2. WHEN each increment completes THEN `bun run build`, `npx tsc --noEmit`, `bun run test`, and
   `bun run lint` (at the existing baseline) SHALL all pass before commit.
3. WHERE a committed secret is discovered (the collection's `Dxp_CLI@1234`) THEN it SHALL be flagged
   for rotation and never echoed or re-committed; it SHALL NOT be used as the app's token source.

## Definition of done

Phase 1 is DONE when: a same-origin BFF route injects the CPR token + tenant server-side and
forwards the allowlisted CPR paths; the client driver points at the BFF and carries no token; the
localhost rail is replaced by a rail that forbids a client token; contract tests + full suite green;
mock default demo unaffected; the Worker-env spike result is recorded. Phase 2 is DONE (for THIS
spec) when the real-auth flow + open questions + customerId-mapping are documented and the open
questions are posed to the customer — NOT when a Keycloak login works (that is a gated follow-up).
No real money, no real cluster traffic.
