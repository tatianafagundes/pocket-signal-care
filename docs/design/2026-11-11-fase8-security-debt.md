# Fase 8 — security & tenancy debt (anchor)

**Status:** open, by design. **Audience:** whoever wires the first real backend (Fase 8).

This consolidates the security/tenancy items from the November 2026 code review that are
*latent* — correct for the all-mock demo, but that MUST be resolved before any real customer data
flows. They are listed here so they can't be lost in scattered TODOs. Each has the exact code
location, the risk, and what the real fix requires.

> Why these weren't "fixed" now: implementing them against in-memory mocks would either simulate a
> security control that isn't the real one (false assurance) or add code with no consumer (dead
> code). The honest move is to anchor them precisely and resolve them when the real backend —
> which owns authorization, RLS, and a server-side token — actually lands.

---

## 1. No real authorization on per-customer reads (the authorization boundary)

**Risk.** The mocks key customer data by `customerId` alone, with no server-enforced check that the
caller is entitled to that customer. Real ids are unguessable UUIDs, so a real customer can't
practically enumerate another's data — but there is **no authorization boundary**. Any party that
learns an id can read it.

**What exists today (NOT the fix).** A *defence-in-depth* tenant check on the 360 entry point:
`getCustomer360(customerId, expectedTenant?)` refuses a cross-tenant read once CPR resolves the
customer's tenant (`src/services/cpr.functions.ts`, the `expectedTenant` gate). This narrows the
predictable-demo-id hole, but it is **client-supplied intent**, not authorization — a malicious
client simply passes the matching tenant. Treat it as a seatbelt, not a lock.

**The real fix (Fase 8).** Server-side authorization: the authenticated identity (from the real
IdP, see §4) must be bound to the customer/tenant, and every read must be checked against it —
TMF/DXP via the gateway's auth + RLS, or an equivalent policy layer in `seam-runtime`'s
`runRead`/`runWrite`. The seam contract already leaves room: `SeamContext` carries `tenantId`, and
`runRead/runWrite` are the single choke point where the check slots in.
Anchors: `src/services/seam-runtime.ts` (the runRead/runWrite comment), `src/services/cpr.functions.ts:187`.

## 2. Seam-name passed where the tenant id belongs

**Risk.** Most seam functions pass a hard-coded SEAM NAME as the context tenant, not the real
tenant — e.g. `runWrite({ tenantId: "ecev" }, …)` (charging), `"eoc"` (order), `"payment"`,
`"cpr"`/`"logistics"`/`"resource"`. It is **log-only today** (the id appears in seam-logger
output), so nothing breaks. But the moment RLS is wired into `runRead/runWrite` (§1), these ops
would present a seam-name where a tenant id is expected and scope wrongly.

**Locations.** `src/services/charging.functions.ts` (`"ecev"`), `order.functions.ts` (`"eoc"`),
`payment.functions.ts` (`"payment"`), `cpr.functions.ts:189` (`listInteractions` → `"cpr"`),
`logistics.functions.ts:44` (`"logistics"`). The input-carrying writes already pass the REAL tenant
(`parsed.data.tenantId`) — it's the reads/writes keyed only by customerId that don't have it.

**The real fix (Fase 8).** Thread the real tenant into these contexts — most naturally by resolving
it from the authenticated identity in `runRead/runWrite` rather than per-call-site, so the fix lands
in one place alongside §1.

## 3. PII in localStorage for 24h (onboarding) — KEPT, by decision

**State.** Onboarding progress (`onboarding:v1`) persists `email`, `givenName`, `familyName`,
`deliveryAddress`, `reservedMsisdn` in **clear localStorage** for 24h, surviving browser close
(`src/lib/onboarding-persistence.ts`). No password/token is ever stored, and reads reject a
different tenant and expire after the TTL.

**Decision (review, Nov 2026): KEEP as-is.** The data is non-secret, tenant-scoped, and TTL-bounded,
and persisting it is what lets an interrupted onboarding resume. This is recorded as a *conscious
acceptance*, not an oversight. If privacy posture changes, the options considered were: (B) stop
persisting address + MSISDN (resume re-asks them), or (C) move PII to sessionStorage and keep only
non-PII progress in localStorage. Revisit if a DPO/privacy review requires data minimisation.

## 4. `VITE_CPR_TOKEN` is bundled into client JS

**Risk.** When the CPR http driver goes live, its bearer token comes from `VITE_CPR_TOKEN`
(`src/services/cpr/cpr-http.ts:35`). A `VITE_`-prefixed env var is **embedded in the client bundle**
by Vite — so a static token would ship to every browser. Harmless while the driver is a stub (no
token set), but a live deployment via this path would leak the credential.

**The real fix (Fase 8).** Don't put a real credential in a `VITE_` var. Terminate auth server-side:
the browser calls a same-origin server route (TanStack server function / BFF), and the server holds
the CPR credential (OAuth2 client-credentials for CBEV per the contract KB) out of client reach.
The token must never be readable from JS — same principle as the session token already kept out of
`sessionStorage` (`src/lib/session-context.ts:13`).

---

## Cross-references
- Seam layer + the "wire a real system" playbook: `src/services/README.md`
- Per-system contracts and endpoints: `docs/contracts/`
- Auth seam prod fail-safe (already enforced): `src/services/driver-config.ts` (`authDriverOrThrow`)
- Config fail-fast at boot: `src/services/driver-config.ts` (`assertDriverConfig`)
