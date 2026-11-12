# Plan — Home (Customer 360) usage UI, from the Figma prototype

> STATUS: plan for review (no code yet). Grounds the UI in the fuon-selfcare PWA prototype v3,
> **P1 Home** (node `188:4` → frame `188:5`), the project `design/DESIGN.md`, and the usage-buckets
> backend already shipped (`UsageBucket`, `bucketState`, `Customer360.usage`, commits 39fce8c…9eea77f).
> Source of truth for visuals: the Figma frame. Source of truth for tokens: `design/DESIGN.md` /
> `src/styles/tokens.css`. Where they differ, tokens win (the prototype is fuon-teal; our app is
> Drei/DreiGo — the accent is one brand token, so the ring/accent reskins for free).

## Goal

Render `Customer360.usage` on the logged-in **Home** screen, matching the prototype's P1. The
backend already composes the buckets; nothing renders them yet. This change is the **Home screen +
the usage/plan cards + their states** — the data already flows in.

## What the prototype's Home actually shows (and what it doesn't)

The Home is a **summary**, not a full bucket panel. Top to bottom (frame `188:5`):

1. **App bar** — brand tile, assistant/bell/avatar icon-buttons. (Bell + assistant are out of scope;
   see "Deferred".)
2. **"Hi Jordan"** — greeting, `title` (24px). Name from `Customer360.party.givenName`.
3. **Balance-below banner** — `notice-banner` warning, shown **only when balance < threshold**
   ("Balance below $15 · Needs $17.60 more by Nov 8 to renew" + a "Top up" link). DESIGN.md already
   names this exact pattern ("notice-banner … also carries low-balance 'Balance below €15'").
4. **Balance card** (`surface=default`) — "Balance" label + "Auto top-up" link; the amount in
   `display-number` (40px, tabular-nums); "Valid until … · N days"; a full-width primary **Top up**
   button. This is the **money axis** — already have `balance` + `formatPrice`.
5. **grid-2** — two 169px cards side by side:
   - **Data card → My plan**: "Data" + chevron; a **Data ring** (88px) whose filled arc = consumed,
     centre text "3.8 GB used"; below it "6.2 GB left". This is the **usage axis** — the primary
     data bucket from `Customer360.usage`.
   - **Plan card → My plan**: "Plan" + chevron; plan name (`Prepaid 10 GB`); "$30 / 30 days";
     "Renews Nov 8"; a success **Badge** ("Active"). From `primaryPlan(c360)` (the enriched offer).
6. **Add-ons row → Add-ons** (`surface=flush`) — icon + "Add-ons / Data and calls from $3 · paid
   from your balance" + chevron. A static entry point.
7. **Tab bar** — 6 tabs, Home active.

**The Home surfaces ONE usage bucket (data) as a ring.** Voice/SMS/roaming are NOT on the Home —
they live on **P10 My plan** ("row Data", "row Calls & texts", add-ons). So this plan renders the
data bucket as the ring on Home; the other buckets are a **follow-up (My plan screen)**, not here.

## Routing decision: `index.tsx` branches — Home for a customer, onboarding otherwise (RESOLVED)

`src/routes/index.tsx` today is a **hybrid**: a placeholder "Hi there" header + a "New to {brand}?
Get started" onboarding block + a sign-in link. Its own comment states the intent: *"Onboarding
entry for prospective customers; existing users keep the dashboard."*

The plan honours that: **branch on `useSession()`** (NOT `useCurrentCustomerId()` — that hook never
returns null, it falls back to the demo customer, so it can't tell a prospect from a signed-in user).
- **`session` present (signed in)** → the logged-in Home (P1: greeting, balance card, Data/Plan grid,
  Add-ons row), reading `getCustomer360(useCurrentCustomerId())`.
- **No `session`** → the current onboarding/sign-in block, unchanged.

`my-plan.tsx` stays the detail screen the Data/Plan cards link to. No new route; Home is `/`.

> Demo note: with no session, `useCurrentCustomerId()` still resolves to the demo customer, so the
> demo can preview the signed-in Home by signing in (onboarding auto-login already sets a session).
> The prospect branch is the honest default for a brand-new visitor.

## Components to build (new) and reuse (existing)

Per DESIGN.md "reuse over recreation" and the implement-design workflow:

### New components (in `src/components/home/` + one shared)
- **`DataRing`** (shared, `src/components/usage/data-ring.tsx`) — the 88px ring. An SVG donut:
  track = `hairline`; filled arc = **consumed** fraction in `accent` (the brand graphic, ≥3:1 ok as
  non-text per DESIGN.md); centre = "{consumed} {unit} used" (`body-sm-strong` + `caption`). Driven
  by a `UsageBucket`. **Accessibility**: the ring is decorative reinforcement — the real fact is the
  text "X GB left" beside it; the ring gets `role="img"` + an `aria-label` repeating "X of Y GB
  used", NOT a bare `role=progressbar` (DESIGN.md + the usage research: a bare progressbar doesn't
  auto-announce). `prefers-reduced-motion`: the arc still renders, just no sweep animation.
- **`UsageSummaryCard`** — the Data card: head (title + chevron link to My plan), `DataRing`,
  "{remaining} left". Drives its **state** from `bucketState(bucket)`:
  - `ok` → neutral, arc in `accent`.
  - `low` → arc + "X left" take `warning`; an inline `warning` dot/word ("Low") so it's **not colour
    alone** (WCAG 1.4.1 / DESIGN.md "colour + a word").
  - `depleted` → `danger`; "No data left" + the recovery affordance (chevron to add-ons/plan).
  - `expired`/`pending` → the word ("Expired" / "Starts {date}"), ring muted, no misleading number.
  - `unlimited` → the **word** "Unlimited" in the value slot, **no ring, no number** (DESIGN.md/
    research: unlimited-as-word, Cash App pattern).
- **`PlanSummaryCard`** — the Plan card from `primaryPlan(c360)`: offer name, price (`formatPrice`),
  "Renews {date}", status Badge.

### Reuse (existing)
- `PageShell`, `Button`, `Skeleton`, `SeamErrorNotice`, `Badge`, `formatPrice`, `useLocalizedTranslation`,
  `useTenant`, `useCurrentCustomerId`, the `customer360` react-query key (same as my-plan.tsx), the
  `notice-banner` / `state-block` patterns, and the existing tab bar.

## States (the prototype designed all of them — we match)
- **loading** (P1·loading) — skeletons: greeting, a skeleton block for the balance, skeleton
  circle + lines in the grid cards. Reuse `Skeleton`; `role="status"` sr-only "Loading…".
- **error** (P1·error) — `SeamErrorNotice` / state-block with a retry; the Add-ons row still shows.
  Matches how `my-plan.tsx` handles `query.isError` today.
- **empty** — a brand-new customer with no usage buckets: the Data card shows an empty state
  ("No allowance yet") rather than a 0-of-0 ring. (`usage: []` already degrades this way from the seam.)
- **offline / top-up pending** (P1·offline, P1·top-up pending) — banners. **Deferred** (needs an
  offline/pending signal we don't model yet); noted so the layout leaves room.

## Tokens (all from DESIGN.md / tokens.css — none new)
- Cards: `surface` + 1px `hairline`, `rounded-card` (12px), **no shadow**.
- Balance amount: `display-number` (40px) + `tabular-nums`.
- Ring: track `hairline`, arc `accent` (brand), state colours `success`/`warning`/`danger` + tints.
- Labels: `caption` (section heads) / `body-sm` / `body-sm-strong`. Links: `accent-ink`.
- Badge: `success` + `success-tint` for "Active".
- Spacing: 16px between stacked cards, 12px inside grid-2, 8px small gaps, 20px gutters, 44px targets
  (matches the prototype's grid and DESIGN.md layout).
- **Brand**: the prototype is fuon-teal `#0e7c7b`; our Home renders in Drei cyan / DreiGo purple via
  `data-brand` — the ring arc and links reskin with the one accent token, no per-screen colour.

## i18n
Every string a key (both locales), inline-fallback style like the rest of the app: greeting, "Balance",
"Auto top-up", "Valid until … · N days", "Top up", "Data", "{n} GB left", "{n} GB used", "Unlimited",
"Low"/"No data left"/"Expired"/"Starts {date}", "Plan", "Renews {date}", "Active", the Add-ons row.
Data formatted per locale; "GB"/"min"/SMS count from the bucket's `unit`.

## Accessibility (WCAG 2.2, from DESIGN.md + usage research)
- State by **icon/word + colour**, never colour alone (1.4.1).
- Ring/graphic ≥3:1 non-text (1.4.11); text ≥4.5:1.
- The ring is `role="img"` with an `aria-label`; the authoritative fact is the adjacent text.
- When a bucket is `low`/`depleted`, announce via an `aria-live="polite"` status (the research point:
  a progress graphic doesn't announce itself). Tap targets 44px; focus-visible ring.
- `prefers-reduced-motion`: no ring sweep / count-up, content still correct.

## Scope boundaries / conscious debt
- **Home renders the data bucket only** (as the ring) + plan summary. Voice/SMS/roaming buckets →
  a **follow-up My plan screen** (P10). The composer already orders all four; My plan will list them.
- **Deferred**: app-bar bell/notifications (P21), the assistant (V1+), offline + top-up-pending
  banners, auto-top-up (P13+). The layout leaves room; none blocks the usage UI.
- No new tokens, no new icon packages (assets from the Figma payload or existing set only).
- Real metering still mock — the ring reflects the seeded/again-granted remaining, which updates
  after an add-on purchase (the stateful mock already does this).

## Resolved decisions (review answers)
1. **`index.tsx` role** → hybrid today; branch on `useCurrentCustomerId()` (Home for a customer,
   onboarding otherwise). See the routing section above.
2. **Data ring fill semantics** → CONFIRMED: arc fills by **consumed**, centre says "{consumed} used",
   the number beside/below is "{remaining} left". Mirror the prototype exactly.
3. **Primary Home data bucket** → the **plan-correlated data bucket** (the `UsageBucket` whose
   `offerId` matches `primaryPlan(c360).offerId`) is the Home ring. Add-on data buckets are NOT on
   the Home; they appear on My plan. Fallback: if no plan-correlated data bucket exists, use the
   first `type: "data"` bucket; if none, the Data card shows its empty state.
4. **Scope** → **Home + Data/Plan cards THIS increment**; the full multi-bucket **My plan** list
   (voice/SMS/roaming) is the NEXT increment. Smallest-correct-change, matches the prototype's
   summary-vs-detail split, ships end-to-end visible value without coupling two screens.

## Primary-data-bucket selection (pure rule to add)
A small pure helper beside the other 360 rules, so the Home and any future screen agree:
```ts
/** The data bucket the Home ring shows: the plan-correlated one, else the first data bucket. */
export function primaryDataBucket(c360: Customer360): UsageBucket | null
```
- Prefer `usage.find(b => b.type === "data" && b.offerId === primaryPlan(c360)?.offerId)`.
- Else `usage.find(b => b.type === "data")`.
- Else `null` (Data card → empty state). Pure, unit-tested, no I/O.
