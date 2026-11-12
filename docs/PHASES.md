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

## Fase 6 — Add-on purchase flow

### Decision: buy = order path (provision to installed base), not a balance debit

An existing customer buying an add-on goes through the **order seam**, exactly like onboarding
already adds add-ons: `createCart(customerId) → addItem({cartId, offerId}) → submitOrder(cartId)`.
In the mock, `submitOrder` provisions each cart offerId as a `Product { kind: "add-on" }` onto
**that cart's `customerId`** installed base, so the add-on then shows up in `getCustomer360`
(installedBase is fed by the order seam; sorted plan → add-on → sim). This works for an existing
`demo-<tenant>` customer with no backend change — verified by the order mock's own test against
seeded `demo-dreigo` (installed-base count +1).

**Why not `charging.rateAndDeduct`:** charging is a pure prepaid ledger (one integer per customer,
`topUp`/`rateAndDeduct` by raw `amountMinor`). It has **no entitlement concept**, so a debit alone
would leave the add-on invisible in the 360 — only a smaller balance. The spec's aspirational chain
is `submitOrder → rateAndDeduct` (charge the order), but in the current mocks the two seams share
**no key and no transaction**: `rateAndDeduct` takes `customerId`+`amountMinor`, not an `orderId`,
so wiring both client-side would be a non-atomic two-write with no rollback (provision the add-on,
then fail the debit → money/entitlement inconsistent). The real ECEV resolves an order's charge
internally; that coupling belongs to the Fase 8 HTTP driver, not a hand-rolled client orchestration
I'd have to tear out. So Fase 6 provisions the entitlement (honest: the add-on is now *owned*) and
uses `qualifyOffer` (balance ≥ price) as the affordability gate — the stand-in for "can they pay"
without faking a charge.

**Classification fix (prerequisite):** `order-mock.ts` `kindForOffer` regex `/add-?on|roam|boost/i`
classifies `drei-addon-1gb` / `drei-addon-eu-1gb` correctly as `add-on`, but `dreigo-stream-pass`
matches nothing → it would provision as `kind: "plan"`. Fixed so streaming passes provision as
`add-on` (otherwise a bought streaming pass would masquerade as the customer's plan in the 360).

### Fase 6 built — buy an add-on (order path) + multi-perspective review

`lib/addon-purchase.ts` `purchaseAddOn(customerId, offerId)` = `createCart → addItem →
submitOrder` (lets SeamFailure propagate to the caller's react-query mutation). The `/add-ons`
route owns the mutation and drives a per-card buy state (idle / busy / success / error); on
success it invalidates `["customer360", …]` and `["add-ons", …]` so the add-on shows in My plan
and the list re-qualifies. `AddOnCard` grew a Buy button (disabled when unqualified) with a busy
spinner, a success state, and an inline error. Removed the old `buyNote` "coming soon" prop;
`pages.addOns.buyNote` → `pages.addOns.buy.{cta,busy,added,error}` (en + de-AT, parity 191/191).

Prerequisite fix: `order-mock` `kindForOffer` now classifies `dreigo-stream-pass` as `add-on`
(was `plan` — the regex missed `pass`/`stream`); anchored (`-pass\b`, `-stream\b`, `\bstream-`)
so future plan ids like `bypass`/`upstream`/`passport` can't false-match. Verified against all 12
catalog ids. 152 tests (4 new: streaming-pass classification + 3 `purchaseAddOn`), build + lint
green.

Captured idle / success / error at phone 390×844 for both brands, plus My plan after buying
(the add-on lands in "Your products", sorted plan → add-on → SIM — proof the order path
provisions into the installed base). Reviewed by two independent passes:

- **code-reviewer: APPROVED.** Two suggestions taken: (1) a multi-card race — while card A's buy
  was in flight, card B's button stayed enabled and A's failure could paint B; fixed by disabling
  all Buy buttons while any purchase is pending (`anyBusy`). (2) the classification regex was
  unbounded; anchored it (above). Declined: a `createCart`-failure unit test (nitpick — the
  propagation path is already proven by the `addItem`-failure test; no speculative padding).
- **design-review: no blockers.** Real a11y findings in the new code, all fixed:
  - **VC-3 (WCAG 2.4.3):** success unmounted the focused `<Button>` and swapped a `<p>` in,
    orphaning keyboard/SR focus. Now the button stays mounted as a disabled "Added" state — focus
    preserved, and it keeps the card's visual weight (also answers VC-4).
  - **VC-5 (WCAG 4.1.3 / 1.3.1):** the error `<p>` had no `role`/`aria-live` and wasn't tied to
    the button. Now `role="alert"` + the button's `aria-describedby` points at it.
  - **R-1 (AAA refinement):** the busy spinner now has `motion-reduce:animate-none`.
  - **VC-1 / VC-2 (DESIGN.md divergence):** the shared shadcn `<Button>` is `rounded-md` with a
    `shadow` and 44px, but DESIGN.md wants pill / no-shadow / 52px. This is the app-wide button
    used by the whole onboarding flow, NOT add-on-specific — fixing it here would be a
    cross-cutting design-system change out of this phase's scope. Logged as debt (below). The
    prior Fase E review wrongly logged "pill nos botões: aderente"; corrected.

Debt raised this phase:
- **Button shape/shadow/height vs DESIGN.md** (VC-1/VC-2): the primary `<Button>` is a
  shadow'd 44px `rounded-md`, not the pill / no-shadow / 52px the system specifies. App-wide fix
  in `components/ui/button.tsx` — a dedicated design-system pass, not a per-feature change.
- **Raw offerId as product name in My plan:** the order mock sets `Product.name = offerId`, so
  My plan shows "drei-addon-1gb" / "up" / "SIM" instead of catalogue names. Pre-existing (hits
  plan + SIM too), but Fase 6 raised its visibility — the user sees a polished "+1 GB" card say
  "Added to your plan," then finds it as "drei-addon-1gb" seconds later. Fix is mapping
  offerId → catalogue name in the order mock, not in the screen. Priority bumped.
- **Not charged yet:** buying provisions the entitlement but does NOT debit balance (deliberate
  — see the decision above). The real charge-by-order is the Fase 8 HTTP driver.
- **"Added" is local route state:** `boughtOfferId` lives in the route component; after a hard
  refresh the bought add-on re-qualifies and shows "Add to my plan" again (buyable twice). A
  durable "already owned" state should come from `getInstalledBase` once the real backend exists.

## Fase 7 — planejada: SIM/eSIM + endereço (TMF673) + payment gateway mock (3 tempos)

Levantamento de impacto a partir do dossiê HLD/LLD interno da jornada `newLine` (SPM/DXP),
encontrado no Glean. O dossiê é a planta de um produto full Journey Mesh; o nosso é um PWA com
seams/mocks client-side, então a Fase 7 é **fiel aos contratos TMF e aos estados, não à
infraestrutura**, e fica no **caso-base EUA (sem identidade)**.

Fonte de verdade destilada: `docs/contracts/onboarding-prepago-dossie.md`. Mapa de impacto por
arquivo: `docs/design/2025-02-16-fase7-impacto-sim-endereco-pagamento.md`. Plano de tarefas 7.1–7.6
na spec (`.kiro/specs/onboarding-journey/tasks.md`).

O que entra: escolha SIM físico vs eSIM (passo `/sim` condicional); endereço de entrega via
`logistics.createAddress` (TMF673 mock) quando físico (passo `/delivery`); provisionamento eSIM
mock (código `LPA:…`/QR, estados do perfil); e um **payment gateway mock** com os três tempos do
pré-pago — **autoriza** no pedido (`payment.authorize`, reserva) → **captura** no marco
(`payment.capture`, mock: pós-submit) → **credita** na ativação (`charging.topUp`). Cartão
tokenizado mock (`4242` autoriza / `4000` recusa), nunca PAN/CVV no código. Isto resolve a
pergunta "falta pagamento no onboarding": falta, e o modelo correto é autorização no pedido —
não cobrança imediata.

Dívidas conscientes registradas na spec: Journey Mesh/BFF/Composite API reais, 3-D Secure/PSP
reais, identidade (Catar/México), marco de captura assíncrono, valor livre + voucher, crédito
pelo fulfilment. Nenhum código de produto escrito ainda — aguardando validação do recorte e da
ordem com a dona do produto.

### Fase 7.1 — entregue: modelo + estado (SIM/eSIM + endereço + pagamento)

Commits `f99e917` (base) + `f6d8d3d` (refinamentos da revisão). Só modelo e estado — nenhuma tela
ainda. `src/services/model.ts` ganhou `SimChoice` (`physical`|`esim`), `Offer.simTypes?`,
`Product.simType?`, `DeliveryAddress` (TMF673), `EsimProfile` (código `LPA:1$…`, estados do perfil
GSMA), `PaymentResult` e `FirstTopUp` (os três tempos do pré-pago como estados). `onboarding-context.ts`
passou os passos para `welcome → plan → sim → addons → number → account → delivery → review → success`,
acrescentou `simType/deliveryAddress/addressId/authorizationRef/orderId` ao estado, e trocou a
constante estática de contagem de passos por `workingStepsFor({offersEsim, simType})` (puro: `sim` só
se a marca oferece eSIM; `delivery` cai para eSIM). `onboarding-persistence.ts` revive os campos novos
com validação estrita. O stepper passou a receber os passos por prop. Revisão (code-reviewer): APROVADO,
zero bloqueios; aplicados comentários de invariante, referência cruzada `authorizationRef/orderId`, e um
ajuste de teste. 162 testes, build + lint verdes, paridade i18n 192/192.

### Fase 7.2 — entregue: seam de pagamento (authorize/capture/void)

Commit `f2f1aa3`. Seam `payment` (extensão paymentAuthorization + TMF676, mock) no mesmo padrão dos
demais: `src/schemas/payment.ts` (zod — `amountMinor` inteiro positivo, `methodToken` opaco, nunca PAN),
`payment/payment-driver.ts` (interface), `payment/payment-mock.ts` (mock determinístico), `payment/
payment-http.ts` (stub `notConfigured`), `payment.functions.ts` (funções do seam) e fiação em `api.ts`
(`authorizePayment/capturePayment/voidPayment/getPayment`). `driver-config.ts` ganhou o seam `payment`
(`VITE_PAYMENT_DRIVER`, default mock). `authorize` reserva e devolve `authorizationRef`; `capture` cobra
no marco e é **idempotente no ref** (capturar duas vezes não cobra de novo — disciplina "Don't pay again"
do dossiê, no nível do seam); `void` libera uma autorização não capturada e recusa uma já capturada
(conflito → precisa estorno, não void); `getPayment` lê o estado atual. Mock determinístico: token com
`4000` recusa (`payment.cardDeclined`, rejected), qualquer outro autoriza. Dinheiro em unidades menores +
moeda ISO (EUR), nunca float. 10 testes novos (172 no total), build + lint verdes.

### Fase 7.3 — entregue: seam `logistics` (TMF673) + eSIM no `resource`

Commit `b4f5e23`. Duas peças, ambas mock, ambas no padrão dos demais seams.

**`logistics` (TMF673 Geographic Address Management, seam novo):** `logistics.functions.ts` +
`logistics/{driver,mock,http}.ts` + `schemas/logistics.ts`. `createAddress` valida e persiste um
endereço de entrega e devolve `addressId`; `getAddress` lê de volta por id (idempotente). Recusa
determinística: país fora de AT, ou CEP começando com `00`, cai em `logistics.addressOutsideDeliveryArea`
(rejected/fixInput) — o caminho de erro de endereço do demo. `driver-config.ts` ganhou o seam
`logistics` (`VITE_LOGISTICS_DRIVER`, default mock).

**eSIM no `resource` (DSIMA, extensão esimProfile / GSMA SGP.22):** `requestEsimProfile` pede ao
SM-DP+ (mock) um perfil para um cliente — **idempotente por customer+tenant** (retry devolve o mesmo
perfil, nunca um segundo eSIM, mesma disciplina "Don't pay again" aplicada ao provisionamento);
`getEsimProfile` consulta o ciclo de vida por id. `activationCode` é a string LPA
`LPA:1$<smdp>$<matchingId>` (texto + QR), ICCID de teste de 19 dígitos, `status: ready`.

`api.ts` fia `createAddress/getAddress` e `requestEsimProfile/getEsimProfile`. 16 testes novos (184
no total), build + lint verdes, paridade i18n intacta (telas vêm na 7.5).

### Fase 7.4 — entregue: orquestração do submit (três tempos do dinheiro + idempotência)

Commit `1645405`. A ativação pré-paga agora roda ponta a ponta pelos seams da 7.1–7.3, com a
**idempotência do dinheiro** como invariante central (a regra "Don't pay again" do dossiê).

**Sequência (autoriza primeiro, para que cartão recusado não crie nada a jusante):**
`authorize` → `createParty` → `createCustomer` → (physical: `createAddress` TMF673 | eSIM:
`requestEsimProfile`) → `createCart` → `addItem(plano, SIM, add-ons)` → `submitOrder({ addressId?,
simType })` (captura o `orderId`) → `capture` (cobra no marco) → `topUp` (credita o primeiro
top-up = preço do plano). São os **três tempos**: autoriza → captura → credita.

**Idempotência:** `authorizationRef`, `partyId`, `customerId`, `addressId`, `esimProfileId` e
`orderId` são persistidos via `patch` e **reusados no retry**; os flags `captured`/`credited` guardam
os dois marcos de dinheiro; o bloco inteiro cart→submit é pulado quando já existe `orderId`. Um retry
depois de falha no meio **não autoriza, submete, captura nem credita duas vezes** — há um teste
"golden" que força falha no `topUp`, refaz, e confere que authorize/submit/capture rodaram uma vez e
`topUp` duas (a 1ª recusada, a 2ª ok).

**Order seam:** `submitOrder` passou a receber `{ cartId, addressId?, simType }`; o mock marca o
produto SIM com o `simType` (My plan mostra "eSIM" vs "Físico") e registra o `addressId` do pedido
(espelha TMF622). `addon-purchase` (Fase 6) passou a chamar `{ cartId }`. **Estado:** `OnboardingState`
ganhou `esimProfileId/captured/credited` (init + revive estrito). **`review.tsx`** passa
`planPriceMinor` (do offer) + um token de pagamento **MOCK** (`tok-visa-4242`); o token real coletado
entra na 7.5. **i18n:** 5 chaves de progresso novas. 188 testes, build + lint verdes, paridade i18n.

Dívida consciente: captura é síncrona no mock (marco real assíncrono = Fase 8); o token de pagamento
é placeholder até a tela da 7.5; sem 3-D Secure/PSP real.
