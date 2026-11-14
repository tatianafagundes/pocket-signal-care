# Tasks — CPR BFF (server-side token) + real auth groundwork

Each task small, verifiable, ends green (`bun run build && npx tsc --noEmit && bun run test &&
bun run lint` at baseline) + a commit. Mock stays the committed default throughout. Phase 2 is
design-only (no Keycloak wiring). Requirement refs in (parens).

- [x] 0. BLOCKING spike — can a server route read a server-only secret? (Req 0)
  - [x] 0.1 Add a throwaway `/bff/ping` server route (`createFileRoute(...).server.handlers.ANY`)
        that reports whether a known server-only value (Worker `env` / `.dev.vars` / non-VITE env)
        is readable at request time. Try the candidate mechanisms from design §0 in order.
  - [x] 0.2 Prove the value is NOT in the client bundle (grep the built client assets / network).
  - [x] 0.3 Record the working mechanism (or "none") in the readiness doc. IF none works from a
        route handler → STOP and revise the design before Task 1 (do not use process.env).
  - Remove the throwaway route after recording. Commit the finding (docs only).
  - _Requirements: 0.1, 0.2_

- [x] 1. BFF proxy route for CPR (server holds the token)
  - [x] 1.1 Add the server route (name/shape per the spike, e.g. `src/routes/bff.cpr.$.tsx`):
        `createFileRoute("/bff/cpr/$").server.handlers.ANY`. Resolve the CPR sub-path from the
        catch-all. (1.1, 1.2)
  - [x] 1.2 Allowlist the CPR paths (party, customer, contract, customerview/{id}) + methods;
        anything else → 404 (not an open relay). (1.3)
  - [x] 1.3 Read `CPR_BASE_URL` + `CPR_TOKEN` (+ the brand→DXP tenant map) from the server-only
        source; add `Authorization: Bearer` + `X-Tenant-ID`; forward via server `fetch`; return the
        upstream status+body unchanged. No body logging. (1.2, 1.4, 1.5)
        - Accessor discipline (H3): read via `globalThis.__env__` then `process.env`; NON-`VITE_`
          keys only; NEVER fall back to `import.meta.env`; a missing secret → null (→ 1.4 envelope),
          never a `Bearer undefined`.
        - NO debug/echo mode in this real route (H5): the spike's /bff/ping echoed env values — the
          real BFF must never expose env, even behind a flag.
  - [x] 1.4 Unconfigured token / unreachable CPR → return the `{code,reason,message}` envelope with
        an appropriate status so `cpr-http` maps it to a normal SeamError. (1.4)
  - [x] 1.5 Unit-test the route with an injected/stubbed upstream fetch: allowlist (forward vs 404),
        header injection (Authorization + X-Tenant-ID present upstream), unconfigured → envelope.
  - Verify + commit `feat(bff): CPR proxy route injecting token + tenant server-side`.
  - _Requirements: 1.1–1.5_

- [x] 2. Point the CPR http driver at the BFF (token leaves the client)
  - [x] 2.1 `cpr-http.ts readConfig()` drops `VITE_CPR_TOKEN`; baseUrl becomes the same-origin BFF
        prefix (default `""` → `/bff/cpr`). (2.1)
  - [x] 2.2 `request()` drops the `Authorization` header; paths become `/bff/cpr/<cpr-path>`; pass
        the app brand as a NON-secret `X-App-Brand` header (tenant resolution now on the BFF). (2.1, 2.2)
  - [x] 2.3 Update `cpr-http.contract.test.ts`: assert same-origin path, NO Authorization,
        `X-App-Brand` instead of resolved X-Tenant-ID; error table unchanged; injected fetch same. (2.3)
  - Verify + commit.
  - _Requirements: 2.1, 2.2, 2.3_

> TRANSIENT INCOHERENCE (J1, review of Task 2): Tasks 2 and 3 are two halves of one contract
> change. After Task 2 but BEFORE Task 3, turning on `VITE_CPR_DRIVER=http` THROWS at boot — the
> stale localhost rail rejects the driver's new `/bff/cpr` default (relative URL → "not a valid
> URL") and still demands `VITE_CPR_TOKEN` the driver no longer reads. This is by design (the split)
> and harmless (mock is the committed default, so demo/CI never hit it), but the http path is
> intentionally unreachable between these two tasks. Task 3 restores coherence — do it without a
> pause. Do NOT ship a release cut between Task 2 and Task 3.

- [x] 3. Flip the config rail to the new trust model
  - [x] 3.1 Replace `assertCprBaseUrlIsLocal()` with a "no CPR token on the client" rail: under
        `VITE_CPR_DRIVER=http`, a set `VITE_CPR_TOKEN` THROWS; a same-origin BFF base URL is allowed. (3.1, 3.2)
  - [x] 3.2 `REQUIRED_HTTP_ENV.cpr` drops `VITE_CPR_TOKEN`; re-home the brand warning to the BFF (or
        drop client-side). Update the driver-config tests (old localhost-rail tests → the new rail). (3.1)
  - [x] 3.3 `.env.example`: client gets `VITE_CPR_DRIVER=http` only; document `CPR_TOKEN`/
        `CPR_BASE_URL`/tenant map as SERVER-ONLY (Worker vars / `.dev.vars`), NOT `VITE_`. (3.1, 3.2)
  - [x] 3.4 Confirm no `.env.local` ⇒ mock default ⇒ demo/CI unaffected. (3.3, 5.1)
  - Verify + commit.
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 4. End-to-end against the fake THROUGH the BFF
  - [x] 4.1 Point the server-only `CPR_BASE_URL` at the local fake; with `VITE_CPR_DRIVER=http` and
        the BFF live, drive onboarding and confirm party+customer+contract reach the fake via the
        BFF (check the fake's `/__debug/last`), with the token injected server-side and NO token in
        any client request. Revert local config after. (1.1–1.4, 2.1)
  - [x] 4.2 Confirm the client bundle contains no CPR token (grep the built assets). (1.2, 3.1)
  - Commit (docs/evidence).
  - _Requirements: 1.1–1.4, 2.1_

- [ ] 5. Phase 2 — real auth groundwork (design + open questions ONLY, no Keycloak wiring)
  - [ ] 5.1 Write the Phase-2 design: Auth Code + PKCE, httpOnly-cookie session set by a server
        route, authenticated-user → CPR customerId mapping replacing `fallbackCustomerId(tenant)`. (4.1)
  - [ ] 5.2 List the open questions for the customer (non-admin end-user flow? realm/client? how to
        get the CPR customerId? service token vs user token / CBEV client-credentials?). (4.2)
  - [ ] 5.3 Confirm `auth-http.ts` stays a stub; flag the committed `Dxp_CLI@1234` for rotation. (4.3, 5.3)
  - Commit `docs(auth): phase-2 design + open questions (not built)`.
  - _Requirements: 4.1, 4.2, 4.3, 5.3_

---

## Notes
- Task 0 is BLOCKING: the whole BFF rests on a server route reading a server-only secret. If the
  spike fails, revise before building anything.
- Order: 0 → 1 → 2 → 3 → 4 → 5. Each task ends green + commit; each is pausable/reviewable (we review
  under multiple perspectives between tasks, as in the previous spec).
- Out of scope (separate specs): recharge/payment, CBEV client-credentials token, real cluster
  cut-over, a working Keycloak login.
