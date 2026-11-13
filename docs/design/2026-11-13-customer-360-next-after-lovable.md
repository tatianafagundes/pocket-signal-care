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
