# Customer 360 — reconciled next steps (after Lovable's 2026-11-13 review)

> STATUS: planning. Supersedes the "next increment = My plan" item in
> `2025-02-18-home-usage-ui-plan.md`. Grounded in the current `main` (commit `b942e7b`), Lovable's
> plans under `.lovable/plan/`, and a full-codebase reconciliation. No code in this doc.

## What is DONE on main (so we don't rebuild it)
- **Home (P1)**: line header (number + status + SIM), balance card with states + renewal
  reassurance, data ring, plan card with relative renewal + auto-renew, conditional renewal/suspended
  notices, conditional "Add data" card, neutral loading, screen-reader fixes.
- **My plan (P10)**: plan section, **all four allowances** (data/voice/sms/roaming) data-driven with
  progress bars + refill date, active add-ons, line section (copy number + SIM type).
- **Rules**: a full pure layer (`lineStatus`, `balanceState`, `renewalWhen`, `homeDataPrompt`,
  `renewalCovered`, `activeAddOns`, …), all tested (313 tests green).
- **Backend**: TMF654 usage buckets + stateful mock + add-on refill + getCustomer360 composition.

## Remaining work, in recommended order

### 1. Hygiene sweep (small, do first — it's debt already on main)
- **i18n fallbacks → English.** Every new component has a Portuguese inline fallback
  (`t("...", "Olá {{name}}")`) while the locale JSON is correct English. Replace the fallbacks with
  the English string so source and runtime agree and a missing key degrades to English, not PT.
  (Rule: zero hardcoded strings; the fallback is the in-source default and must match en-US.)
- **Prune dead `en.json`/`de-AT.json` keys**: `pages.myPlan.productsLabel`, `noProducts`,
  `statusActive`, `number`, `loadError`, `retry`, `pages.home.lowBalance.*` — unreferenced after the
  My plan rework. Keep locale parity (parity.test.ts enforces it).
- Formatting already fixed in the working tree (Lovable left 16 prettier errors).

### 2. Demo data for the unseen states (so the review states are reachable)
Lovable's review notes several states that exist in code but can't be previewed because no demo
customer exercises them. Seed demo fixtures for:
- a **suspended** line (`Customer.status: "suspended"`) — proves `SuspendedNotice` + badge,
- an **unlimited** data plan (DreiGo "Go Unlimited") — proves unlimited-as-word on ring + allowance,
- an **expired / empty balance** — proves `balanceState` "expired"/"empty" copy,
- a **pending** line — proves the pending sentence.
Mock-only; the seams already carry the shapes. This is the cheapest way to make the design reviewable.

### 3. Visual verification (not yet done for the signed-in dashboard)
The signed-in Home + My plan have never been captured rendered (no Playwright in the project; the
dashboard mounts client-side after sessionStorage). Options:
- add the `ui-capture` tooling and drive login→Home / My plan screenshots in Drei + DreiGo, EN + DE,
  across healthy / low / suspended; OR
- hand it to the user to eyeball. Decide before calling the UI "done".

### 4. Then — genuinely new scope (pick with the user)
From Lovable's "Later" lists and the prototype map, none built yet:
- **Recent activity** on Home/Account: last top-up + what the balance was spent on (needs a usage/
  transaction history read — TMF635, currently out of scope).
- **Tab count**: prototype/DESIGN.md say six tabs; Apple-review suggests five (move language to
  Account). A navigation decision, not usage.
- **Per-bucket remedial actions** for voice/SMS/roaming (today only data has "Add data").
- **Assistant (V1+)** and **notifications (P21)** — large, separate features in the prototype.

## Recommendation
Do **1 (hygiene)** and **2 (demo states)** as one small increment — they make the already-shipped
UI correct and reviewable — then **3 (capture)**, then bring **4** to the user as a scoped choice.
Nothing here rebuilds what Lovable shipped; it finishes and verifies it.

---

## Visual capture — round 1 (2026-11-13, signed-in dashboard)

Captured the signed-in Home + My plan across all demo states with Playwright (ui-capture skill).
Scenario `docs/design/roteiro-captura.json`; images `docs/design/capturas/r1/`. Drei brand, EN,
desktop width (the app renders its 390px phone column centred). Login via the real form, then the
Account demo switcher drives each state. **Console was clean** (no runtime errors in any state).

### Confirmed working (matches Figma P1 + the Apple-calm review)
- **Healthy Home**: line header (number + copy + "Active · eSIM" green badge), Balance €15.00 with
  green-dot "Covers your renewal in 25 days", Data ring (1.8 GB left, amber consumed arc, "Running
  low" + amber dot), Plan card ("up", €14.90, "Renews in 25 days", "Automatically, from your
  balance"), and the conditional "Add data" card (shown because data is low).
- **Unlimited**: Data card shows the word "Unlimited" (no ring/number); Plan "up Unlimited+" €29.90.
- **Suspended**: danger "Suspended · eSIM" badge, "Your line is suspended" danger notice + Get help,
  Balance "No balance / Top up to keep using your line", Data "No data allowance yet" empty state.
- **Loading**: neutral grey skeletons shaped like the real layout (no brand-tint flash) — caught
  incidentally and confirms Lovable's fix.

### Findings (for a later pass — NOT fixed here)
1. **Suspended line still shows "Renews Jan 1, 2027 · Automatically, from your balance" on the Plan
   card.** A suspended line with €0 won't auto-renew; the renewal / auto-renew copy in
   `PlanSummaryCard` (and/or `renewalWhen`) doesn't account for `lineStatus === "suspended"`. A
   cross-state inconsistency unit tests miss. Likely fix: suppress or reword the renewal line when
   suspended (and arguably when balance is empty/expired).
2. **No mobile capture width.** The ui-capture tool's widths are all desktop-class, so the phone
   column sits centred on a wide canvas. Fine for content review; if we want true 390px framing,
   add a mobile width to the tool or crop.

### Reproduce
`bun run dev`, then:
`python3 ~/.kiro/skills/ui-capture/tools/capture.py --url http://localhost:8080 --roteiro docs/design/roteiro-captura.json --out docs/design/capturas/r2 --temas claro --larguras desktop --full --diff docs/design/capturas/r1`
(`--diff` flags any state that moved vs r1 — pixel regression gate for the next UI change.)

---

## Finding #1 fixed — suspended line no longer claims auto-renewal (2026-11-13)

The suspended Plan card dropped the misleading "Renews … · Automatically, from your balance" lines.
- New pure rule `planRenewalVisible(c360)` in `customer360-rules.ts`: false when suspended, false
  when the plan is still pending (a Pending badge shows instead), false when there is no renewal
  date. 4 unit tests.
- `PlanSummaryCard` takes a `showRenewal` prop (the rule's result) and gates both renewal lines on
  it; Home passes `planRenewalVisible(data)`.
- Proven with a `--diff` re-capture (round r2 vs r1): only `04-home-suspended` changed semantically
  (the two lines removed); the healthy Home's ~600px diff was subpixel ring/text rasterization
  noise, not a content change. 317 tests green, build/tsc/lint clean.

Known test gap (accepted): the regression gate is the pure-rule unit tests plus the visual diff;
there is no DOM test asserting the component consumes `showRenewal` (a full TanStack-router render
fought jsdom). If the JSX guard were deleted, unit tests would stay green — the visual round would
catch it. Revisit if a lightweight router-render helper is added for component tests.

Still open from the capture review: the empty/expired-balance case (not suspended) still shows the
renewal line though the balance won't cover it — deliberately left, since the shortfall `renewal`
notice already covers that; reconsider if it reads as contradictory.

---

## Recent activity — step 1 shipped (financial feed via charging getActivity)

Grounded in Glean/DMP docs: "last top-ups / recent activity" is **financial history**, served in real
DMP Evolved by a union of two charging-axis sources — **TMF654 Prepay Balance Management** (the
top-up-balance list, BUC C349A_5) for top-ups and allowance refills, and **Financial Transaction
Enquiry** (`transactionType` Payment/Refund, FIN) for payments, refunds and operator adjustments.
Both are read via the charging seam — NOT Party Interaction (TMF683, the relationship timeline on
CPR). So the money feed lives on the charging axis.

> Correction (validated against Glean after step 1 shipped): an earlier draft attributed the whole
> feed to Financial Transaction Enquiry alone. That API carries only Payment/Refund (postpaid/FIN);
> prepaid top-ups and refills are retrieved from the TMF654 top-up-balance list. The seam is
> unchanged — it was always the right union seam — only the source attribution is corrected.

- `ActivityItem` model + `Customer360.activity`; composer sorts newest-first, defaults [].
- Charging seam `getActivity(customerId)` (driver + http stub notConfigured); mock seeds a short
  history per demo variant and records a `topUp` on each top-up, a `refill` on each add-on grant.
- `getCustomer360` fan-out adds `getActivity`, degrades to [] independently.
- `RecentActivity` on Account: grouped hairline-divider card, icon + label + date + signed amount
  (neutral colour; status owns green/red) + status dot/word; empty state. i18n both locales.
- The real-ECEV swap is a connector: `getActivity` http driver maps TMF654 top-up-balance records
  and Financial Transaction Enquiry records → `ActivityItem`, zero UI change. Same pattern as usage
  buckets.

Known demo artifact (accepted): a SEEDED refill carries a price (−€3.50, standing in for a real
top-up-balance / financial-transaction record), but a LIVE add-on purchase records a refill with NO amount —
the add-on's money charge isn't deducted through this seam, so inventing a price would be dishonest.
If this reads as inconsistent, a later step can either price live refills (needs the charge in the
grant) or drop the seeded refill's amount.

Deferred to step 2: merge Party Interactions (onboarding/plan-change/support) into the same feed via
a pure `activityFeed(c360)` composer — the UI already reads one list, so only the composer changes.
Also: the capture scenario's `03-account-switcher` step name is now stale (Account leads with Recent
activity); rename on the next capture-scenario edit.
