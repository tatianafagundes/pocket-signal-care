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

## Fase C — Wizard skeleton (routes + provider + i18n) — shipped, reviewed

Commits `8886e63` (feat) → `d86312e` (review). 106 tests.

Shipped:
- `lib/onboarding-context.ts`: the 7-step model (`ONBOARDING_STEPS`), `OnboardingState`
  (non-secret only), and the context identity.
- `lib/onboarding-persistence.ts` (+ test): load / save / clear non-secret wizard state in
  sessionStorage, scoped to the tenant, with a 60-minute TTL and a strict revive (malformed,
  expired, or other-tenant state → start clean). SSR-safe, never throws.
- `components/onboarding-provider.tsx` + `hooks/use-onboarding.ts`: provider pins the tenant for
  the life of the flow, persists on every patch; guard hook.
- `components/onboarding/wizard-page.tsx`: the wizard page frame. Moves focus to the step heading
  on each step change (WCAG 2.4.3) and announces "Step N of M, <title>" via an aria-live region
  (4.1.3). Deliberately separate from the shared `PageShell` so other routes are untouched.
- `components/onboarding/onboarding-stepper.tsx`: progress dots with `aria-current="step"` and
  visually-hidden state labels — progress is never conveyed by colour alone.
- `routes/onboarding.tsx` (layout mounting the provider) + 7 step routes
  `routes/onboarding/{welcome,plan,account,details,number,review,success}.tsx`. Each syncs its
  step into the persisted state via `hooks/use-sync-onboarding-step.ts`.
- `locales/en.json` + `locales/de-AT.json`: full-parity `onboarding` key block (de-AT informal
  "du"). `lib/format.ts`: `formatPrice` via `Intl.NumberFormat`.

Locked decisions:
- **Non-secret state only in the provider/sessionStorage** — the password and token never enter
  the wizard state (a test asserts the serialized blob matches no `password`/`token`).
- **The tenant is pinned when the flow starts** — a mid-flow brand change does not split a
  half-finished flow, and persistence refuses to resume another tenant's state.
- **sessionStorage, not localStorage** — resume is scoped to the session, matching "resume within
  the same session"; a 60-minute TTL stops a stale flow from confirming a long-released MSISDN.

Note: the i18next locale codes are `"en"` and `"de-AT"` (not `"en-US"`); `"en-US"` is the
conceptual product default.

Review outcome (revisor APPROVED, code-reviewer CHANGES REQUESTED, 0 blockers): restored the
focus ring on the heading (it was `outline-none` — WCAG 2.4.11); aligned the announced total with
the stepper by counting the WORKING steps (M = 6, shared `ONBOARDING_WORKING_STEPS`), so success
announces its title only, not "Step 7 of 7"; dropped a redundant `aria-live`; corrected the de-AT
price doc example and added `format.test.ts` pinning the real ICU output; added an exact-TTL and
an extra-key-leak persistence test.

## Fase D — Screens wired to seams — shipped, reviewed

Commits `ea44dc1` (welcome + plan + shared nav/error) → `e62e15e` (assist + account) →
`c4e3359` (details + number + review + success) → `d373682` (review fixes). 117 tests. This phase
established the repo's first form (react-hook-form + zod via `components/ui/form`), data-fetching
(react-query), and navigation (`useNavigate`) patterns.

Shipped:
- Shared: `WizardNav` (back/continue), `SeamErrorNotice` (maps a `SeamFailure` to localized copy
  under the `onboarding.seamError.*` tree; retry only when retryable), `/onboarding` → welcome
  redirect.
- welcome: brand-aware title + "See plans" CTA. plan: `listOffers` via react-query with
  skeleton/error-retry/empty states, `RadioGroup` option-rows, recommended badge, and the B4
  price label. assist: optional disclosure — 3 behavioural questions → pure `recommend()` → a
  labelled suggestion. account: RHF+zod form, `autocomplete` email/new-password, live password
  checklist (announces criterion transitions, not keystrokes). details: name form. number:
  `listAvailableMsisdn` + `reserveMsisdn` with the concurrency path. review: summary rebuilt at
  render, confirm runs the submit orchestration with per-step announcements. success: result head
  + link to my-plan.
- `lib/format.ts` `offerPriceLabel` (pure B4 logic, tested). `lib/onboarding-submit.ts`
  `runOnboardingSubmit` (the activation sequence, tested for idempotent retry).

Locked decisions:
- **B1 — the review summary is rebuilt from state at render**, looking the offer up fresh from
  the grid, so changing the plan upstream can never leave a stale price/plan in the summary.
- **B4 — a price states its nature**: `offerPriceLabel` yields "€14.90 every 30 days ·
  auto-renews", never a bare amount that reads as one-off.
- **The password never leaves the account form**: it's passed to `api.register` and only the
  email is persisted to the wizard state (a context test already guards the stored shape).
- **Idempotent retry**: party and customer (durable, orphan-prone) are reused on retry; the cart
  is rebuilt fresh each attempt because the mock's `addItem` appends — reusing it would double the
  line items.
- **Qualify is not called on the onboarding plan step**: with no customer every offer is
  qualified, so per-offer qualify calls would be speculative. `OfferOption` still supports a
  `qualify` prop for the (later) add-ons route.

Conscious debts (honest scope): "see all plans" expansion not built (the mock grid fits on
screen); submit is synchronous in the mock (`status: "completed"`), so the real
`acknowledged → partial/failed` async flow, the "partially provisioned" terminal state, and MSISDN
reservation TTL/expiry are Fase 8 concerns — they can't be exercised against the mock today. A
terminal submit error with retry IS implemented.

Verification caveat: the pages are verified by build, typecheck, and unit tests — NOT yet by
running the app in a browser (there's a pre-existing `vite preview` env issue). Runtime render,
focus/announcement behaviour, and the state matrix across both brands belong to Fase E
(`ui-capture`).

Review outcome (revisor APPROVED, code-reviewer CHANGES REQUESTED, 1 blocker): wired the password
input to the checklist via `aria-describedby` (the blocker — SR users had no strength feedback);
forced the terminal-error category to "unavailable" to match `retryable`; fixed a doubled assist
reason i18n key (was resolving only by i18next fuzzy traversal); memoised the account/details zod
schemas; made the review incomplete-notice `role="alert"`; removed the unused `OfferOption.qualify`
prop and ~14 dead locale keys; added a locale-parity test (keys + interpolation placeholders) as a
standing guard. The password-isolation invariant, B1, B4, and idempotent retry were all confirmed
clean by both reviewers (traced + mutation-tested).

---

## Fase E — runtime capture + a11y/visual review — done

The onboarding flow was run in a real browser (Playwright, via the ui-capture skill) and the full
happy path captured end-to-end — the first time the app was verified running, not just by tests.
Captures live in `docs/design/capturas/`; the visual review is in
`docs/design/2025-02-14-onboarding-fase-e-visual.md`.

Two independent reviews ran: a visual pass on the rendered screens and a static a11y/i18n audit of
the code. Findings were triaged against the running app before any fix — several "blockers" were
capture artifacts, not real bugs.

Fixed (confirmed real):
- **Focus ring on the wizard heading** — it had `outline-none` with no `focus-ring`, so the
  programmatic focus on each step change was invisible to keyboard users (WCAG 2.4.7). Now uses
  the `focus-ring` utility.
- **Sub-44px touch targets** — the review "Change" links, assist yes/no + Skip + Suggest, the
  seam-error "Try again", the WizardNav Back, and the my-plan/home CTAs were 32–36px. Raised to
  `min-h-11` at each call site (left the shadcn Button base alone — changing it is too broad).
- **Selected plan card border** — selection showed only via the radio dot; the card now also
  carries a 2px accent-ink border (DESIGN.md), driven by the radio's `data-state` via `has-[]`, so
  selection is not conveyed by a single signal.
- **Password checklist glyph** — an unmet criterion used a hollow circle that read as a selectable
  radio; it's now a dash (a "pending" marker), with the check for met.

Rejected, with evidence (this is the point of running it, not just reviewing images):
- **"Sticky header/footer cover content" (the visual review's two blockers)** — a capture
  artifact of the desktop full-page screenshot compositing a `position: sticky` footer over tall
  content. Re-captured at a real phone viewport (390×844) and measured the bounding boxes: the
  Confirm-password field sits at y≈736 with the footer at y≈788 — fully visible and reachable,
  content scrolls under the pinned footer normally. Not a bug; the fix was to the capture method
  (phone viewport), not the app.
- **"Link colour is bright cyan" (VC-3)** — false alarm. The links already use `text-accent-ink`
  (`#0073a0`, ≥4.5:1), not the bright `#0096c5`. Not measurable from the image; confirmed in the
  tokens.

Not re-litigated: the Drei primary-button contrast is the documented A1 exception. Verified clean:
i18n en/de-AT parity, form autocomplete tokens, aria-live regions (step, checklist transitions,
loading, errors), focus-order mechanism, heading structure (one h1 per screen).

Debt noted: states not in the capture set (terminal submit error, expired-MSISDN, "see all plans")
weren't reviewed at runtime; the `head()` meta is hardcoded English + a "whitelabel" placeholder
(not localized/tenant-branded) — a separate i18n workstream.

### Fase E debt closed — error/edge states captured + reviewed

Added a DEV-only forced-error hook (`src/services/dev-mock-controls.ts`): under
`import.meta.env.DEV` only, it exposes `window.__mock.{forceError,clearForcedError,isForced}` so
the running app (and the capture harness) can arm a seam failure without a real outage. Verified
the production bundle does NOT contain it (tree-shaken by the DEV guard).

Captured 5 error/edge states at phone viewport (390×844) and reviewed them: plan list error,
add-ons list error, my-plan `getCustomer360` error, number-reserve error, and the review
submit **terminal** error ("account saved, couldn't activate, try again"). All render their
recovery path. The review found one real blocker and three should-fixes, all fixed:
- The terminal submit error had TWO buttons calling the same `confirm()` (a "Try again" in the
  notice and "Confirm and activate" in the footer) — ambiguous in the most consequential state.
  The notice is now message-only; the footer is the single retry path.
- The error notice now uses the Fuon danger treatment (danger-tint fill + full-opacity border)
  and the retry is a pill with no shadow, matching DESIGN.md (was a weak white/50%-border Alert
  with a rounded-md shadowed button).
- The review "Change" links used the shadcn `link` variant (`text-primary` = the bright cyan
  #0096c5, ~3.3:1) — now `text-accent-ink` (#0073a0, ≥4.5:1). This corrects an over-broad "false
  alarm" call from the first Fase E pass: the "More info" links were fine (already accent-ink),
  but the `Button variant="link"` "Change" links were genuinely below contrast.

Honest limitations of the capture: `forceError` persists across SPA navigation but not a full
reload (arm, then navigate by click); react-query's default 3 retries delay the error state ~5s;
and the specific MSISDN `taken` concurrency copy can't be reproduced with the client-side mock
(per-page module state) — the generic unavailable+retry path is captured, the specific copy stays
unit-tested. The capture scripts are throwaway (not committed); the review docs are in
`docs/design/`.
