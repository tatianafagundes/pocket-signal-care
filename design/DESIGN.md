---
version: alpha
name: whitelabel mvno selfcare
description: Design system for the whitelabel MVNO self-care PWA (Drei host + DreiGo MVNO). Adapted from the fuon selfcare design system — same tokens, components, states and accessibility discipline; the brand is a theme. Base/default brand is Drei; a second brand (DreiGo) proves the white-label by overriding brand tokens only. Every colour, type, radius and spacing value used on a screen lives here and nowhere else. Swap the brand entry and the wordmark and the app rebrands.
baseOf: fuon selfcare (DESIGN.md alpha) — structure, components, rules inherited; only the brand colours/fonts/wordmark differ.
colors:
  canvas: "#f5f6f8"
  surface: "#ffffff"
  surface-tint: "#eef0f3"
  surface-sand: "#fbf4e8"
  hairline: "#e4e7eb"
  border-input: "#858c96"
  ink: "#16181d"
  text-primary: "#16181d"
  text-secondary: "#5f6670"
  text-tertiary: "#8a919b"
  text-inverse: "#ffffff"
  accent: "#0e7c7b"
  accent-ink: "#0e7c7b"
  accent-hover: "#0b6665"
  accent-tint: "#d9efee"
  success: "#15703a"
  success-tint: "#e3f4ea"
  warning: "#d97a00"
  warning-tint: "#fff4e0"
  danger: "#c2281f"
  danger-tint: "#fbe5e3"
  focus: "#7c5cd6"
  disabled: "#c9ced6"
  disabled-text: "#8a919b"
  button-primary-hover: "#2a2d34"
typography:
  display-number: { fontFamily: Helvetica Neue, fontSize: 40px, lineHeight: 44px, fontWeight: 700, letterSpacing: -0.02em }
  title:          { fontFamily: Helvetica Neue, fontSize: 24px, lineHeight: 30px, fontWeight: 600, letterSpacing: -0.01em }
  heading:        { fontFamily: Helvetica Neue, fontSize: 18px, lineHeight: 24px, fontWeight: 600 }
  body:           { fontFamily: Helvetica Neue, fontSize: 16px, lineHeight: 24px, fontWeight: 400 }
  body-strong:    { fontFamily: Helvetica Neue, fontSize: 16px, lineHeight: 24px, fontWeight: 600 }
  body-sm:        { fontFamily: Helvetica Neue, fontSize: 14px, lineHeight: 20px, fontWeight: 400 }
  body-sm-strong: { fontFamily: Helvetica Neue, fontSize: 14px, lineHeight: 20px, fontWeight: 600 }
  caption:        { fontFamily: Helvetica Neue, fontSize: 12px, lineHeight: 16px, fontWeight: 500 }
  control:        { fontFamily: Helvetica Neue, fontSize: 16px, lineHeight: 20px, fontWeight: 600 }
  tab-label:      { fontFamily: Helvetica Neue, fontSize: 11px, lineHeight: 14px, fontWeight: 500 }
  tab-label-strong:{ fontFamily: Helvetica Neue, fontSize: 11px, lineHeight: 14px, fontWeight: 600 }
rounded:
  none: 0px
  tile: 8px
  control: 12px
  card: 12px
  sheet: 20px
  pill: 999px
  check: 6px
spacing:
  xxs: 2px
  xs: 4px
  s: 8px
  m: 12px
  l: 16px
  xl: 20px
  xxl: 24px
  section: 32px
  gutter: 20px
  icon-s: 16px
  icon-m: 20px
  icon-l: 24px
  tap: 44px
  phone-width: 390px
brandName: Drei
brands:
  drei:
    name: Drei
    note: Base/default brand. Palette from drei.at official CSS — cyan #0096C5 (most-used blue) is the brand action colour; primary button = cyan filled, white label, pill (like "Mein Drei"). Text is grey #5c5c5c (body, 70× in the CSS) / #1f1f1f (strong/title) — not black, not the dropped navy #0f273b. Purple #71439d and lime #DDEE3D are CAMPAIGN colours (hero gradient, offer cards, badges) — never a link, button or body colour. Hero band is a blue->purple gradient #0096C5 -> #71439d. Font is Helvetica Neue (the brand font in drei.at CSS, matching the "3" brand); a proprietary "drei" script face (Typejockeys) is used for campaign flourishes and is not bundled. KNOWN EXCEPTION (decision A1) — white on cyan #0096C5 is ~3.3:1, below 4.5:1; shipped on the primary button + hero only to match the brand (the site has the same shortfall). Links/rings use accent-ink #0073a0 (>=4.5:1); body text #5c5c5c/#1f1f1f is accessible. The red #DA1B1B in the CSS stays a detail/alert colour, never the accent.
    fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif"
    wordmark: assets/drei-wordmark.png
    colors:
      accent: "#0096c5"
      accent-ink: "#0073a0"
      accent-hover: "#007aa6"
      accent-tint: "#e0f3fa"
      button-primary: "#0096c5"
      button-primary-text: "#ffffff"
      button-primary-hover: "#007aa6"
      ink: "#1f1f1f"
      text-primary: "#1f1f1f"
      text-secondary: "#5c5c5c"
      campaign-purple: "#71439d"
      campaign-lime: "#ddee3d"
      gradient-hero: "linear-gradient(120deg, #0096c5, #71439d)"
  dreigo:
    name: DreiGo
    note: Fictitious data-only MVNO on Drei, to prove the white-label. Purple from the Nubank design system (#820AD1); ~5.6:1 on white so it serves as link directly AND as the filled primary button (white label, accessible) — Nubank style. Lime is decorative highlight only — never a link, ring, or the only signal of a state. Font inherits the base Helvetica Neue stack (a brand may override).
    fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif"
    wordmark: assets/dreigo-wordmark.png
    colors:
      accent: "#820ad1"
      accent-ink: "#820ad1"
      accent-hover: "#6a08ab"
      accent-tint: "#f0e5fb"
      button-primary: "#820ad1"
      button-primary-text: "#ffffff"
      button-primary-hover: "#6a08ab"
      ink: "#16181d"
      text-primary: "#16181d"
---

# whitelabel mvno selfcare — design system

## Overview

A self-care PWA for a prepaid mobile operator, built by **adapting the fuon selfcare
design system**. Structure, components, states and accessibility discipline are inherited
from fuon; only the brand (colours, font, wordmark, copy name) changes. The base/default
brand is **Drei** (the host operator / MVNE); **DreiGo** is a second brand — a fictitious
data-only MVNO on Drei — that exists to prove the white-label: it overrides brand tokens
only, with no new screen and no hardcoded colour.

Two rules make the brand swappable (inherited from fuon):

1. **The accent is the brand, and the brand is one token.** `colors.accent` appears on the
   brand tile behind the wordmark, the active tab, links, selected rows and input focus —
   and nowhere else. Change it (and `accent-ink`, `accent-tint`, the wordmark) and the app
   rebrands.
2. **The primary button is the brand's filled button.** Primary actions use
   `colors.button-primary` (the brand accent, filled, white label, pill) — Drei cyan, DreiGo
   purple — matching each operator's real site. A new brand sets `button-primary` +
   `button-primary-text` + `button-primary-hover`. (This replaces the fuon "buttons are ink"
   rule: both shipping brands fill the button with their accent, so ink is reserved for text
   and the secondary-button outline.)

### How tokens become code (this repo)

The values in this front matter live as CSS custom properties in **`src/styles/tokens.css`**
— the one file with raw colours. `src/styles.css` binds those tokens to Tailwind v4
utilities and to the shadcn role variables the components read. A component never hardcodes a
colour; it uses a utility (`bg-accent-tint`, `text-accent-ink`, `bg-primary` = the brand's
filled primary button, …). The active brand is set once with `<html data-brand="drei|dreigo">`
in `src/routes/__root.tsx`.

### What is NOT the fuon base

The top-level `colors:` block keeps the fuon base values so the system has a complete
default; the **active brand always overrides them**. The default brand is `drei` (see
`brandName`), so a screen with no `data-brand` renders fuon-teal — that is a fallback, not
a shipping state. Ship with `<html data-brand="drei">` or `="dreigo"`.

## Accent, accent-ink and contrast (the one thing that differs from fuon, and why it matters)

fuon's accent (teal #0e7c7b) is 5.0:1 on white, so one token served both links and
graphics. **Our brands can't assume that** — so this system adds `accent-ink`:

- **`accent`** — the brand colour for the brand tile, active tab, selected-row wash, data
  ring, icon glyphs. Needs ≥3:1 (non-text, WCAG 1.4.11) where it is a graphic.
- **`accent-ink`** — the colour for **text links and the selection ring/dot**, which need
  ≥4.5:1 on white. When a brand's `accent` already passes 4.5:1, `accent-ink` equals
  `accent` (DreiGo). When it does not, `accent-ink` is a darkened member of the same hue
  (Drei).

Contrast ratios below were computed by hand with the WCAG 2.x formula and **must be
reconfirmed with `tools/contrast.py` at brand birth** (spec Phase 1.4) before a brand
ships. A brand only "exists" when its table passes.

| Pair | Drei | DreiGo | Min | Note |
|---|---|---|---|---|
| `button-primary-text` on `button-primary` | **~3.3:1 ✗** (#fff on #0096c5) | ~5.6:1 (#fff on #820ad1) | 4.5 | **Drei: KNOWN EXCEPTION (A1)** — shipped to match the brand; scoped to primary button + hero only. DreiGo passes. |
| `accent` on surface #fff | ~3.3:1 | ~5.6:1 | 4.5 (text) / 3 (graphic) | Drei cyan #0096c5 is graphic-only; **not** a link |
| `accent-ink` on surface #fff | ~4.6:1 (#0073a0) | ~5.6:1 (=accent) | 4.5 | the link/ring colour — accessible both brands |
| `text-primary` on surface #fff | ~14:1 (#1f1f1f) | ~16.4:1 (#16181d) | 4.5 | strong/title text |
| `text-secondary` on surface #fff | ~7:1 (#5c5c5c) | ~8.6:1 (#5f6670) | 4.5 | body text — accessible both brands |
| `text-primary` on `accent-tint` | reconfirm (#e0f3fa) | reconfirm (#f0e5fb) | 4.5 | selected-row / avatar text |
| `accent` on canvas #f5f6f8 | reconfirm | reconfirm | 3 | data-ring, unread dot |

**Drei note:** `accent` cyan `#0096c5` is ~3.3:1 on white — fine as a graphic (≥3:1), below
4.5:1 for text — so the **link and selection ring use `accent-ink` `#0073a0`** (a darkened
cyan, ~4.6:1), not the bright cyan. The bright cyan is the primary-button fill and the hero
(the A1 brand exception) and larger brand graphics. `text-secondary` `#5c5c5c` is the body
colour (the site's dominant grey). Reconfirm each at Phase 1.4.

**Drei's campaign colours (purple + lime).** drei.at uses purple `#71439d` and lime `#DDEE3D`
on campaign surfaces — the hero gradient, offer cards and badges (e.g. the "6 Monate" badge,
the lime price card). They are brand tokens (`campaign-purple`, `campaign-lime`) reserved for
banners/offers only. **Never a link, a button, body text, or the only signal of a state** —
status still owns success/warning/danger, and links still use `accent-ink`.

**Why cyan is the accent, not red:** fuon's `danger` is red and is a system token a brand
cannot change; a red Drei accent would make links and errors the same hue. Drei's own action
colour is cyan `#0096c5` — opposite hue to red, so action and error never blur.

## Colors

Inherited from fuon, unchanged except via the brand block:
- **Canvas and surfaces.** Page is `canvas`; every card is `surface` white, 1 px `hairline`
  border, **no shadow**. `surface-tint` (neutral grey — no brand hue) / `surface-sand` are quiet info panels — never a
  button, never a header.
- **Status owns green, amber, red.** `success` = paid/done/eligible; `warning` = due
  soon/pending/processing; `danger` = failed/overdue/turn-off. Always a dot or badge **plus
  a word** — colour is never the only signal. **`warning` is graphic-only** (icon, ring, bar,
  dot; ≥3:1 on white): an amber dark enough for 4.5:1 text reads brown, so warning words are
  `text-primary` next to the amber mark (the iOS pattern). `success` and `danger` pass 4.5:1 and
  may colour their words. These are **system tokens; a brand cannot
  change them** (so a brand accent must not be red — see above).
- **Text.** `text-primary`, `text-secondary` (placeholders too, ≥4.5:1), `text-tertiary`
  for chevrons/dividers only — never a string.
- **Borders of controls.** `border-input` 3.4:1 on white (WCAG 1.4.11 ≥3:1). System token.
- **Focus** is a 2 px `focus` violet ring. System token, distinct from every brand accent.

## Typography

Helvetica Neue everywhere (the Drei brand font; system stack, no webfont), 11 styles (listed
in front matter). Numbers that mean money, data or time use `font-variant-numeric: tabular-nums`. The only big thing on a screen is the number that
matters (`display-number`). Links and section labels are `body-sm-strong` sentence case.
**No uppercase eyebrow labels.** Money is written one way: EUR formatted by the active
locale (de-AT `1.234,56 €`, en-US `€1,234.56`); whole euros in offers/rows, two decimals in
totals/ledgers; every monetary value states its nature (plan price / balance / top-up).

## Layout

One phone width: 390 px, 20 px gutters. 16 px between stacked cards, 12 px inside a grid-2,
8 px between quick tiles, 32 px before a titled section. Tap targets 44 px minimum; buttons
52 px. Bottom tab bar 84 px with **six tabs — Home · My plan · Top up · Add-ons · Account ·
Support** (the prepaid set; fuon's prose lists a different six for the generic flow) and
exactly one active (in `accent-ink` for Drei, `accent` for DreiGo). Pre-sign-in screens have
no tab bar — though this demo does not authenticate, so sign-in is out of scope.

## Elevation & Depth

No shadow, no photography, no uppercase. The one gradient is the brand **hero band**
(`gradient-hero`, blue→purple for Drei) — a brand surface, not decoration; everywhere else is
flat. Hierarchy comes from canvas/surface contrast, hairlines and type. Bottom sheets sit on a
40 % ink scrim — the one place depth is implied. **shadcn ships shadows and its own radii by
default; the adaptation must null the shadows** and bind radii to the tokens above.

## Shapes

12 px on cards, inputs and content tiles; 8 px on small glyph tiles; 6 px on the checkbox;
20 px on bottom sheets; **pill (999) on buttons** (primary + secondary — both Drei and DreiGo
ship pill buttons), chips, badges and circular controls. Nothing else.

## Components

Inherited from fuon as tokens (full list in the spec design.md). Highlights and the rules
that travel with them:

- **button-primary** — `button-primary` fill (the brand accent: Drei cyan / DreiGo purple),
  white label, 52 px, **pill radius** (both brands use pill buttons on their sites). One per
  screen, full width, bottom of content or sticky above the tab bar.
- **button-secondary** — white with `border-input`, pill. **button-danger** — restricted:
  only in a confirmation sheet, or as a secondary button with `danger` text on a screen.
  Never a loose red button.
- **link** — `accent-ink`, `body-sm-strong`. On a status tint the link takes the status
  colour, not the accent (`danger` on the danger tint; on the warning tint, `text-primary`
  underlined, because `warning` is graphic-only).
- **card** (no shadow), **card-tint**, **row** / **row-compact**, **option-row** (radio +
  `accent-tint` wash when selected), **chip** / **chip-selected** (`accent-tint` fill + 2 px
  `accent-ink` ring), **badge** (success/warning/danger/neutral), **tab-bar** (6 tabs),
  **notice-banner** (info/warning/danger; also carries low-balance "Balance below €15"; one
  at a time on Home — a suspended line shows only its own notice),
  **result-head** (72 px circle in the status tint — success check / pending clock / error
  alert / info), **skeleton** (never shows a value), **state-block** (empty/error body with
  one action — never "Something went wrong" alone), **data-ring** (and allowance bars: the fill is what's LEFT, never what's used), **stepper-dot**,
  **status-bar**, **app-bar**, **icon-button**, **avatar**, **quick-tile**, **focus-ring**.
- **brand-tile** — 52×32 `accent` rectangle with the white wordmark. The **only** place the
  logo renders.

## Selection

**Selected means accent, everywhere** (inherited). Selected card = 2 px `accent-ink` border;
selected option-row = `accent-ink` ring + dot + `accent-tint` wash; selected chip =
`accent-tint` fill + 2 px `accent-ink` ring; active tab = `accent-ink` (Drei) / `accent`
(DreiGo). Text on `accent-tint` is `text-primary`, never `accent`. The filled brand accent is
for the primary button and hero only, never for a selected state (selection is tint + ring).

## Internationalisation

en-US (default) + de-AT (second locale, draft — to be validated by Drei before a real
customer sees it). Every UI string is a key; zero hardcoded strings. **Both tenants default to
en-US**; de-AT is opt-in via the language selector until Drei validates the copy. (When it is
validated, Drei's default can flip to de-AT — but then the SSR `<html lang>` must be resolved
server-side to match, so the first paint doesn't flash from en to de-AT.) Sentence case in
en-US; German orthography (nouns capitalised) in de-AT. Dates and money format by the active
locale.

## Do's and Don'ts

- Do put the number first, the action second; never a promo first.
- Do use one term per concept: **Top up** (not "Recharge") for prepaid balance credit, in
  tab, title and button; `offer` = catalogue item, `plan` = the primary offer bought,
  `add-on` = an offer on an existing contract.
- Do write status as a sentence with colour + word; dates/money per locale.
- Do fill the primary button and the hero with the brand accent (Drei cyan / DreiGo purple) —
  that is the brand signature. Everywhere else the accent is a graphic or a link (`accent-ink`).
- Don't use the accent as a card surface, a card title, or body text; links are the only
  accent text (and they use `accent-ink`), except on a status tint where the link takes the
  status colour.
- Don't use the campaign colours (purple, lime) as a link, button, body text, or the only
  signal of a state — they are for banners/offers/badges only.
- Don't use green, amber or red for anything that is not a state — and a brand accent is
  never red (it would collide with `danger`).
- Don't add shadows, photography or uppercase labels. (The hero gradient is the one allowed
  gradient — a brand surface, not decoration.)
- Don't let a brand change a system token: status + tints, `focus`, `border-input`,
  `disabled`, `text-tertiary`, `text-inverse`, spacing, radii.

## Brands

A brand is a **mode**, not a copy (inherited from fuon). `brands:` lists each operator with
its name, font, wordmark and the colours it overrides; a colour it does not list keeps the
base value. A brand may change: `accent` (+`accent-ink`, `accent-tint`, `accent-hover`), `button-primary`
(+text, hover), `gradient-hero`, campaign colours, surfaces/canvas, `ink`, text colours, font
family, wordmark, and the copy name. The system keeps: status colours + tints, `focus`,
`border-input`, `disabled`, `text-tertiary`, `text-inverse`, spacing, radii.
`<html data-brand="drei|dreigo">` is the whole swap; no second file. Adding a third operator =
one new `brands:` entry whose contrast table passes — no screen changes.

### Drei (base / default)
Host operator (MVNE). Palette from drei.at official CSS: `accent` cyan `#0096c5`, `accent-ink`
`#0073a0` (link/ring, ~4.6:1), `button-primary` cyan `#0096c5` + white label (A1 exception,
~3.3:1), text `#1f1f1f` (strong) / `#5c5c5c` (body), `accent-tint` `#e0f3fa`. Campaign colours
purple `#71439d` + lime `#DDEE3D`; hero gradient `#0096c5 → #71439d`. No navy. Default locale
en-US (de-AT opt-in until Drei validates the copy). Wordmark placeholder until the official
asset is supplied.

### DreiGo (second brand, the white-label proof)
Fictitious data-only MVNO on Drei. `accent` purple `#820ad1` (Nubank; ~5.6:1 on white, so
`accent-ink` = `accent` and the button passes), `accent-tint` `#f0e5fb`, `ink` `#16181d`,
hero gradient purple. Lime, if used, is a decorative highlight only. Default locale en-US.
Wordmark placeholder.

## Open items (reconfirm before shipping a brand)
- Run `tools/contrast.py` per brand and publish the full table (Phase 1.4). Hand-computed
  ratios here are order-of-magnitude, not the measured record.
- Drei hex set is from drei.at official CSS (accent `#0096c5`, text `#5c5c5c`/`#1f1f1f`,
  campaign `#71439d`/`#DDEE3D`); confirm against Drei brand guidelines if/when available.
- The A1 primary-button/hero contrast exception (~3.3:1) — confirm Drei accepts it, or get an
  on-cyan label treatment that passes 4.5:1.
- Official Drei and DreiGo wordmark assets.
- Drei's proprietary display/script face ("drei", by Typejockeys) is used on drei.at for
  campaign flourishes. It is not licensable/bundleable here, so the app uses the Helvetica
  Neue stack only. If Drei supplies the licensed webfont, add it as a `--font-brand-display`
  for hero/campaign headings; until then those render in Helvetica Neue.
- de-AT copy validation by Drei.
