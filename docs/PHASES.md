# Phase record — onboarding journey

What has shipped on `main`, in order, with the decisions locked in each phase. This is the
repo-local record of progress; the full spec (requirements / design / tasks) lives in the Kiro
workspace, not in this repo. For *how* the seam layer is wired, see `src/services/README.md`;
for the DXP contract findings behind these decisions, see `docs/contracts/`.

Each phase is implemented seam/logic-first (pure rules + mock driver, testable without UI), then
reviewed with a multi-perspective pass (code-reviewer + revisor subagents) before moving on.

---

## Backend seams (Fases 0–4) — shipped

The seam architecture: UI → `api.ts` → `<seam>.functions.ts` → driver (mock | http), every call
returning a never-throwing `SeamResult`. Seams: cpr (customer), order, charging, catalog,
resource, auth. Driver selection via `VITE_<SEAM>_DRIVER` env with a `PROD && mock → throw`
guard. See `src/services/README.md` for the anatomy and the seam-name trap (folder name ≠ env
key for catalog/order/charging → ecm/eoc/ecev).

## Fase A — Auth seam (logic, no UI) — shipped, reviewed

Commits `3b73957` (feat) → `bccc214` (review). 81 tests.

Shipped:
- `auth-rules.ts` (pure): `validateEmail`, `scorePassword` (min8 / upper / lower / number),
  `validateCredentials`.
- `model.ts`: `Account`, `Session`, `Credentials`, `PasswordStrength`. No new required field on
  existing types.
- `auth/{auth-driver,auth-mock,auth-http}.ts`: mock with `withMock` (latency + forceError),
  in-memory store separate from cpr-mock, **discards the password after register**,
  `Session.origin='mock'`, token via `crypto.randomUUID()`. The http stub returns
  `notImplemented` and documents **OIDC Authorization Code + PKCE** (never ROPC).
- `auth.functions.ts` + `driver-config.ts` (adds `"auth"` to `SeamName` and `ENV_KEY`, plus the
  PROD fail-safe guard) + `api.register` / `api.login`.

Locked decisions:
- **The password is an auth secret and never touches CPR** — it lives only in the form's memory
  and the seam argument; never in a provider, sessionStorage, log, or party/customer.
- **Login (mock) accepts any format-valid credential** for the demo, mitigated by the PROD guard.
  A real login *route* (returning customer) is out of scope for this phase — debt registered.

Review outcome: the `PROD && mock → throw` guard had no test → added `driver-config.test.ts`
(mutation-tested), plus login forced-error and `tooLong` paths. Redacted an example JWT found in
`product-ordering-management-v5.yaml`.

## Fase B — Enriched catalogue + recommendation (logic) — shipped, reviewed

Commits `819da43` (feat) → `2eaf8d0` (review). 91 tests.

Shipped:
- `model.ts` `Offer`: made `validityDays?` / `recommended?` optional; added optional `autoRenew?`,
  `euRoaming?`, `network?`, `unlimitedData?`, `kind?`, `category?`. A flattening of TMF620
  ProductSpecCharacteristics.
- `catalog/catalog-mock.ts`: a realistic prepaid grid per tenant — Drei "up" line
  (up Start / up / up Max / up Unlimited+) and DreiGo (Go 8 / 20 / Unlimited) plus data add-ons.
  Prices are a defensible placeholder, not official Drei prices. `listOffers` returns **plans
  only**.
- `catalog-rules.ts` `qualifyOffer`: **tri-state TMF679** (`qualified | unqualified | alternate`)
  with a `reasonKey`, not a bare boolean. No customer → qualified; price > balance → unqualified.
- `recommendation-rules.ts` (pure): `recommend(answers, offers)` suggests one plan by reading
  `category`/fields (never hardcoded ids), labelled `confidence: "suggested"` — a deterministic
  rule with the same shape a real Next Best Offer (TMF679 alternateProposal) would have.

Locked decisions:
- **The SIM is not a catalogue Offer** — onboarding reuses the order seam's `<tenant>-sim-po`
  provisioning id.
- **One plan per `category` tier per tenant**, so the recommendation maps a tier to exactly one
  offer (this is why `drei-up-max` is `premium`, not a second `standard`).
- **`Offer.kind` ("addon", no hyphen) and `Product.kind` ("add-on", hyphen) are distinct
  domains** — an Offer is buyable, a Product is provisioned. Do not unify.

Review outcome: two blockers fixed — (1) `drei-up` and `drei-up-max` were both `standard`,
making the recommendation order-dependent → `drei-up-max` became `premium`; (2) the add-on filter
was negative (`kind !== "addon"`) → positive (`kind == null || kind === "plan"`) in both
`recommend()` and `listOffers()`, so a future non-plan kind is excluded by default. Added a
`TODO(Fase 8)` where a real ECM fills `alternativeOfferId`, JSDoc on the kind distinction, and
stronger tests (add-ons never recommended on any branch, `plans[0]` fallback, named
listOffers-excludes-add-ons).

---

## Next: Fase C — wizard skeleton

`OnboardingProvider` + routes `src/routes/onboarding/{welcome,plan,account,details,number,review,success}`,
i18n en-US / de-AT, non-secret state persisted to sessionStorage with expiry (never password or
token), and focus/announcement a11y (focus to step title + "Step N of M"). See the Kiro-workspace
`tasks.md` Fase C for the full task breakdown and verify criteria.
