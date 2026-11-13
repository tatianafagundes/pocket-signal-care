# Spec review — CPR http onboarding (six lenses)

Review of `requirements.md` + `design.md` + `tasks.md` before implementation. Each finding has a
severity (BLOCKER / SHOULD-FIX / NOTE) and a proposed resolution. Findings that change the spec are
folded back into the spec docs; the rest are recorded as debts.

Facts verified for this review (from the collection + code, 2026-11-13):
- Contract body (collection): `{ customerId, communicationId, paymentContext:"PREPAID",
  agreementDocumentNumber, statuses:[{status:"ContractActive",reason,validFor:{start}}],
  contractSpecification{id,href}, characteristics[], externalId, relatedParty[], relatedEntity[] }`.
- Collection's `communicationId` is a FABRICATED counter (`814552030000`+1), NOT the reserved MSISDN.
- Our onboarding reserves a real MSISDN (`state.reservedMsisdn`, E.164) via the `resource` seam;
  the interaction step already passes it as `msisdn`.
- `SeamError` categories are exactly: validation | notFound | conflict | rejected | unavailable |
  unknown; `retryable` is derived (only `unavailable` retries).

---

## Lens 1 — Telecom / TMF-DXP architect

**F1 (SHOULD-FIX) — `communicationId` semantics.** The contract keys on `communicationId` (the
MSISDN). The collection fabricates a counter; we have a real reserved E.164 MSISDN. Decision: send
`state.reservedMsisdn` as `communicationId`. Risk: the real CPR may expect a bare national number
(`814552030000`) not E.164 (`+43681...`), and may validate format. Resolution: map through a small
normalizer in the http mapper (strip `+`/spaces for the wire if the real API needs it), keep E.164
in our domain; against the fake, accept as-is. Record as a shape-to-confirm against the real cluster.

**F2 (NOTE) — Contract fields we omit.** The real contract accepts `agreementDocumentNumber`,
`externalId`, `contractSpecification`, `characteristics`, `statuses[]`. Our `createContractSchema`
sends only `{customerId, communicationId, paymentContext}`. The mapper `toTmfContract` will add
`statuses:[ContractActive]`. We omit `agreementDocumentNumber`/`externalId` — fine for the fake, but
the real deployment may require an agreement number. Resolution: document as a debt; the mapper is
the one place to add them when the real contract needs them.

**F3 (SHOULD-FIX) — Contract timing vs the real order model.** In the real DXP, the technical
contract is often created BY the order/shopping-cart flow (the customerview sample shows contract
as a product inside the cart), not as a standalone `POST /contract` before the order. Our collection
does a standalone `POST /contract`, so following the collection is correct for THIS integration, but
we should note the divergence: our onboarding order block is mock here, so creating the contract
standalone (collection-style) is consistent. When the real order seam lands, reconcile who owns
contract creation. Record as a debt (contract-ownership-vs-order).

**F4 (NOTE) — `paymentContext:"PREPAID"` is correct** for the prepaid app; no postpaid path here.

## Lens 2 — Software / seam architect

**F5 (NOTE) — Additive, surgical, convention-matching.** The design adds `createContract` exactly
parallel to `createParty`/`createCustomer` across model/schema/driver/mock/http/functions/api. Good:
no new abstraction, TMF only in mappers, seam-never-throws preserved. No change needed.

**F6 (SHOULD-FIX) — `getCustomerAndParty` shape risk.** The design hedges between `/customerview/{id}`
and customer+party GETs. The customerview sample in the CPI doc is large and postpaid-flavored; the
prepaid shape may differ. Resolution: keep the hedge, but add an explicit task sub-step to capture
the fake's customerview response in `response-shapes.md` BEFORE writing `fromTmfCustomerView`, so the
mapper is written against a concrete shape, not a guess. (Fold into Task 5.)

**F7 (SHOULD-FIX) — Driver chosen at module load.** `cpr.functions.ts:32` resolves the driver once
at import. A contract test that flips env after import tests the wrong driver. The design already
says "construct `createCprHttp()` directly" — make that a hard rule in the test task (don't rely on
env-flip for the http contract test). (Already in design §10/Task 6; elevate to explicit.)

**F8 (NOTE) — `runWrite` tenantId.** `createContract` passes `tenantId: parsed.data.tenantId` to
`runWrite` (brand slug, for logging/scoping) — consistent with createParty/createCustomer. The
DXP tenant resolution (brand→TEN) happens only at the http header layer. Correct separation.

## Lens 3 — Security / privacy

**F9 (BLOCKER-for-real, OK-for-fake) — Token ships to the client.** `VITE_CPR_TOKEN` is exposed in
client JS. The design already restricts http to the local fake and defers the BFF to Phase D, and
`cpr-http.ts` already carries the FASE-8 comment. Resolution: keep as-is for the fake; make the
guard explicit in the spec: a CI/lint or a runtime check that REFUSES a non-localhost
`VITE_CPR_BASE_URL` while the token is a VITE_ var. Proposed: add to Task 7 a check that warns/【
throws if `VITE_CPR_BASE_URL` is not localhost/127.0.0.1 (so nobody accidentally points the
client-token driver at a real host before the BFF exists). This is a real safety rail, cheap to add.

**F10 (SHOULD-FIX) — PII in request logs / fake.** Party create carries name + email (PII). The seam
logger is metadata-only (op/tenant/ms, never payloads) — confirm the new contract/party http path
does NOT log bodies. The fake's `/__debug/last` stores request bodies (PII) in memory — acceptable
for a local dev fake, but document it must never be deployed and the ring is memory-only (no disk).
Resolution: note in the fake README; assert no body logging in the driver.

**F11 (NOTE) — No secrets in the repo.** The fake token is the literal string "fake"; `.env.local`
is gitignored; `.env.example` gets placeholders only. Good.

## Lens 4 — QA / testability

**F12 (SHOULD-FIX) — Contract-test transport decision is deferred.** Design §10/Task 6 leaves A
(fake over HTTP in `beforeAll`) vs B (fetch-shim fixtures) open. For CI determinism and no port
contention, **recommend B (fetch-shim fixtures)** as the default: inject a `fetch` into
`createCprHttp()` (or stub global fetch within the test file only) that replays `response-shapes.md`
and records the request. Reserve A for a separate, optional "live-fake smoke" not run in CI.
Resolution: make B the default in the design; this also removes the child_process/port flakiness
risk. Requires `createCprHttp()` to accept an injectable `fetch` (small, test-only seam) — add that
to Task 4.1.

**F13 (SHOULD-FIX) — Error-mapping tests need per-code cases.** Req 5.2 tests one 4041. Add cases
for 404→notFound, 4040→rejected, 5xx→unavailable, and a malformed body→badResponse, so the whole
mapping table (design §5) is locked. (Expand Task 6.3.)

**F14 (NOTE) — Mock contract test.** Task 2.7 covers mock createContract (success/invalid/no-customer).
Good; mirrors existing pattern.

**F15 (SHOULD-FIX) — Onboarding contract-step test.** Task 3 relies on "existing coverage". The
contract step is new logic (idempotency on `contractId`, position before order). Add a unit test
asserting: step runs after customer + before order, persists `contractId`, and is skipped on retry
when `contractId` present (mirror the existing submit idempotency tests). (Add to Task 3.)

## Lens 5 — Worst-day user / operations

**F16 (SHOULD-FIX) — Partial-failure honesty.** With `VITE_CPR_DRIVER=http` but payment/charging
still mock, onboarding creates a REAL party/customer/contract against the fake, then does MOCK
authorize/capture/topUp. If the contract POST succeeds but a later (mock) step fails, we have a real
contract with no completed activation. Against the fake this is harmless (resettable), but the
pattern is worth stating: during Phase A/B the http path is NON-TRANSACTIONAL across seams (no saga/
compensation). Resolution: document explicitly that mixed mock/http onboarding can leave a
fake-side contract without a finished order; the idempotent retry resumes, and the fake is
resettable. A real cross-seam compensation is a later concern (out of scope).

**F17 (SHOULD-FIX) — MSISDN missing at contract time.** Design §8 lets the contract run with empty
`communicationId` if `reservedMsisdn` is absent. A contract with empty communicationId is
meaningless. Resolution: make `communicationId` required at the step — if `reservedMsisdn` is null,
FAIL the step with a clear SeamError rather than sending empty, since onboarding guarantees the
number before review anyway. (Tighten design §8 + Req 3.1.)

**F18 (NOTE) — Fail-fast on misconfig.** Already wired (`assertDriverConfig` via `getRouter`).
Confirmed; Task 7.2 verifies it.

## Lens 6 — Product owner / honesty

**F19 (NOTE) — Scope is honest.** Recharge/auth/BFF/cluster explicitly out; contract-now matches the
stakeholder decision; tenant placeholder documented. Good.

**F20 (SHOULD-FIX) — "Done" definition for this spec.** Add an explicit exit statement: this spec is
DONE when onboarding creates party+customer+contract against the fake with `VITE_CPR_DRIVER=http`,
contract tests + mock tests green, demo unaffected with the flag off, and debts recorded — WITHOUT
any real money, real auth, or real cluster. (Add to requirements as a closing "Definition of done".)

**F21 (NOTE) — Demo risk.** The only user-visible change with mock default is the new onboarding
progress label "Setting up your contract…". Confirm the copy and i18n parity. Acceptable, intended.

---

## Resolutions folded into the spec (actions)
- R-F1/F17: `communicationId` = required `reservedMsisdn`; fail the step if missing; normalizer in
  mapper; confirm format vs real cluster (debt). → design §8, Req 3.1.
- R-F6: capture the fake's customerview shape before writing `fromTmfCustomerView`. → Task 5.
- R-F7: http contract test constructs `createCprHttp()` with an injected `fetch`; never env-flip. → design §10, Task 4.1/6.
- R-F9: refuse a non-localhost base URL while the token is a client VITE var (safety rail). → Task 7.
- R-F10: assert no request-body logging; document the fake's in-memory PII ring. → Task 1, Task 4.
- R-F12: default contract-test transport = fetch-shim fixtures (B); inject fetch. → design §10, Task 6.1.
- R-F13: error-mapping tests cover the whole table. → Task 6.3.
- R-F15: add onboarding contract-step idempotency/position unit test. → Task 3.
- R-F16: document non-transactional mixed mock/http onboarding. → design (debts).
- R-F20: add a Definition of Done. → requirements.

## Debts recorded (not blocking Phase A/B)
- Contract fields omitted (`agreementDocumentNumber`, `externalId`, specification, characteristics).
- `communicationId` format vs real cluster (E.164 vs national).
- Contract ownership vs the real order/cart flow (who creates the technical contract).
- Client token / fake-only; real auth + BFF is Phase D.
- No cross-seam compensation during mixed mock/http.
- Real brand→TEN tenant map.
