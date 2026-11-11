---
version: alpha
name: whitelabel mvno selfcare
description: Design system for the whitelabel MVNO self-care PWA (Drei host + DreiGo MVNO). Adapted from the fuon selfcare design system — same tokens, components, states and accessibility discipline; the brand is a theme. Base/default brand is Drei; a second brand (DreiGo) proves the white-label by overriding brand tokens only. Every colour, type, radius and spacing value used on a screen lives here and nowhere else. Swap the brand entry and the wordmark and the app rebrands.
baseOf: fuon selfcare (DESIGN.md alpha) — structure, components, rules inherited; only the brand colours/fonts/wordmark differ.
colors:
  canvas: "#f5f6f8"
  surface: "#ffffff"
  surface-tint: "#eef6f5"
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
  warning: "#9a4607"
  warning-tint: "#fbeedd"
  danger: "#c2281f"
  danger-tint: "#fbe5e3"
  focus: "#7c5cd6"
  disabled: "#c9ced6"
  disabled-text: "#8a919b"
  button-primary-hover: "#2a2d34"
typography:
  display-number: { fontFamily: Inter, fontSize: 40px, lineHeight: 44px, fontWeight: 700, letterSpacing: -0.02em }
  title:          { fontFamily: Inter, fontSize: 24px, lineHeight: 30px, fontWeight: 600, letterSpacing: -0.01em }
  heading:        { fontFamily: Inter, fontSize: 18px, lineHeight: 24px, fontWeight: 600 }
  body:           { fontFamily: Inter, fontSize: 16px, lineHeight: 24px, fontWeight: 400 }
  body-strong:    { fontFamily: Inter, fontSize: 16px, lineHeight: 24px, fontWeight: 600 }
  body-sm:        { fontFamily: Inter, fontSize: 14px, lineHeight: 20px, fontWeight: 400 }
  body-sm-strong: { fontFamily: Inter, fontSize: 14px, lineHeight: 20px, fontWeight: 600 }
  caption:        { fontFamily: Inter, fontSize: 12px, lineHeight: 16px, fontWeight: 500 }
  control:        { fontFamily: Inter, fontSize: 16px, lineHeight: 20px, fontWeight: 600 }
  tab-label:      { fontFamily: Inter, fontSize: 11px, lineHeight: 14px, fontWeight: 500 }
  tab-label-strong:{ fontFamily: Inter, fontSize: 11px, lineHeight: 14px, fontWeight: 600 }
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
    note: Base/default brand. Colours extracted from drei.at official CSS (identity is white/black/blue; the cyan is the action colour, confirmed on the willkommen page). The red #DA1B1B present in drei.at CSS stays a detail/alert colour, never the accent.
    fontFamily: Inter
    wordmark: assets/drei-wordmark-white.png
    colors:
      accent: "#00a0d2"
      accent-ink: "#006a8e"
      accent-hover: "#0081aa"
      accent-tint: "#e0f3fa"
      ink: "#0f273b"
      text-primary: "#0f273b"
      button-primary-hover: "#1a3850"
  dreigo:
    name: DreiGo
    note: Fictitious data-only MVNO on Drei, to prove the white-label. Purple from the Nubank design system (#820AD1); passes 4.5:1 on white so it serves as link directly. Lime is decorative highlight only — never a link, ring, or the only signal of a state.
    fontFamily: Inter
    wordmark: assets/dreigo-wordmark-white.png
    colors:
      accent: "#820ad1"
      accent-ink: "#820ad1"
      accent-hover: "#6a08ab"
      accent-tint: "#f0e5fb"
      ink: "#16181d"
      text-primary: "#16181d"
      button-primary-hover: "#2a2d34"
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
2. **Buttons are ink, not brand.** Primary actions are `colors.ink` on white. A new brand
   never has to re-prove that its colour works as a button.

### How tokens become code (this repo)

The values in this front matter live as CSS custom properties in **`src/styles/tokens.css`**
— the one file with raw colours. `src/styles.css` binds those tokens to Tailwind v4
utilities and to the shadcn role variables the components read. A component never hardcodes a
colour; it uses a utility (`bg-accent-tint`, `text-accent-ink`, `bg-primary` = ink, …). The
active brand is set once with `<html data-brand="drei|dreigo">` in `src/routes/__root.tsx`.

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
| `accent` on surface #fff | ~2.9:1 | ~5.6:1 | 4.5 (text) / 3 (graphic) | Drei cyan is graphic-only; **not** a link |
| `accent-ink` on surface #fff | ~5.4:1 (#006a8e) | ~5.6:1 (=accent) | 4.5 | the link/ring colour |
| `text-inverse` on `ink` | ~13:1 (#0f273b) | ~17.8:1 (#16181d) | 4.5 | primary button label |
| `text-primary` on `accent-tint` | reconfirm (#e0f3fa) | reconfirm (#f0e5fb) | 4.5 | selected-row / avatar text |
| `accent` on canvas #f5f6f8 | reconfirm | reconfirm | 3 | data-ring, unread dot |

**Drei note:** because `accent` cyan is ~2.9:1 on white — below even the 3:1 non-text floor —
the **selection ring, link and icon glyphs use `accent-ink` (#006a8e)**, not the cyan. The
cyan is reserved for larger brand surfaces (brand tile, data-ring fill) where it reads as a
graphic against a larger area. Reconfirm each at Phase 1.4.

**Why Drei is blue, not red:** drei.at's own CSS and the willkommen page are white/black/blue.
The cyan accent also avoids a collision the spec review flagged (B4): fuon's `danger` is red
and is a system token a brand cannot change; a red Drei accent would make links and errors the
same hue. Cyan vs red are opposite hues — action and error never blur.

## Colors

Inherited from fuon, unchanged except via the brand block:
- **Canvas and surfaces.** Page is `canvas`; every card is `surface` white, 1 px `hairline`
  border, **no shadow**. `surface-tint` / `surface-sand` are quiet info panels — never a
  button, never a header.
- **Status owns green, amber, red.** `success` = paid/done/eligible; `warning` = due
  soon/pending/processing; `danger` = failed/overdue/turn-off. Always a dot or badge **plus
  a word** — colour is never the only signal. These are **system tokens; a brand cannot
  change them** (so a brand accent must not be red — see above).
- **Text.** `text-primary`, `text-secondary` (placeholders too, ≥4.5:1), `text-tertiary`
  for chevrons/dividers only — never a string.
- **Borders of controls.** `border-input` 3.4:1 on white (WCAG 1.4.11 ≥3:1). System token.
- **Focus** is a 2 px `focus` violet ring. System token, distinct from every brand accent.

## Typography

Inter everywhere, 13 styles (listed in front matter). Numbers that mean money, data or time
use `font-variant-numeric: tabular-nums`. The only big thing on a screen is the number that
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

None. No shadow, no gradient, no photography, no uppercase. Hierarchy comes from
canvas/surface contrast, hairlines and type. Bottom sheets sit on a 40 % ink scrim — the one
place depth is implied. **shadcn ships shadows and its own radii by default; the adaptation
must null them** and bind radii to the tokens above.

## Shapes

12 px on cards, buttons, inputs and content tiles; 8 px on small glyph tiles; 6 px on the
checkbox; 20 px on bottom sheets; pill (999) on chips, badges and circular controls. Nothing
else.

## Components

Inherited from fuon as tokens (full list in the spec design.md). Highlights and the rules
that travel with them:

- **button-primary** — `ink` fill, 52 px, radius control. One per screen, full width, bottom
  of content or sticky above the tab bar. **Never the brand colour.**
- **button-secondary** — white with `border-input`. **button-danger** — restricted: only in a
  confirmation sheet, or as a secondary button with `danger` text on a screen. Never a loose
  red button.
- **link** — `accent-ink`, `body-sm-strong`. On a status tint the link takes the status
  colour, not the accent.
- **card** (no shadow), **card-tint**, **row** / **row-compact**, **option-row** (radio +
  `accent-tint` wash when selected), **chip** / **chip-selected** (`accent-tint` fill + 2 px
  `accent-ink` ring), **badge** (success/warning/danger/neutral), **tab-bar** (6 tabs),
  **notice-banner** (info/warning/danger; also carries low-balance "Balance below €15"),
  **result-head** (72 px circle in the status tint — success check / pending clock / error
  alert / info), **skeleton** (never shows a value), **state-block** (empty/error body with
  one action — never "Something went wrong" alone), **data-ring**, **stepper-dot**,
  **status-bar**, **app-bar**, **icon-button**, **avatar**, **quick-tile**, **focus-ring**.
- **brand-tile** — 52×32 `accent` rectangle with the white wordmark. The **only** place the
  logo renders.

## Selection

**Selected means accent, everywhere** (inherited). Selected card = 2 px `accent-ink` border;
selected option-row = `accent-ink` ring + dot + `accent-tint` wash; selected chip =
`accent-tint` fill + 2 px `accent-ink` ring; active tab = `accent-ink` (Drei) / `accent`
(DreiGo). Text on `accent-tint` is `text-primary`, never `accent`. Ink fill is for primary
buttons only, never for a selected state.

## Internationalisation

en-US (default) + de-AT (second locale, draft — to be validated by Drei before a real
customer sees it). Every UI string is a key; zero hardcoded strings. Locale default per
brand (Drei → de-AT, DreiGo → en-US), user can switch. Sentence case in en-US; German
orthography (nouns capitalised) in de-AT. Dates and money format by the active locale.

## Do's and Don'ts

- Do put the number first, the action second; never a promo first.
- Do use one term per concept: **Top up** (not "Recharge") for prepaid balance credit, in
  tab, title and button; `offer` = catalogue item, `plan` = the primary offer bought,
  `add-on` = an offer on an existing contract.
- Do write status as a sentence with colour + word; dates/money per locale.
- Don't use the accent as a surface, a header, a button fill, or a card title; links are the
  only accent text (and they use `accent-ink`), except on a status tint where the link takes
  the status colour.
- Don't use green, amber or red for anything that is not a state — and a brand accent is
  never red (it would collide with `danger`).
- Don't add shadows, gradients, photography or uppercase labels.
- Don't let a brand change a system token: status + tints, `focus`, `border-input`,
  `disabled`, `text-tertiary`, `text-inverse`, spacing, radii.

## Brands

A brand is a **mode**, not a copy (inherited from fuon). `brands:` lists each operator with
its name, font, wordmark and the colours it overrides; a colour it does not list keeps the
base value. A brand may change: `accent` (+`accent-ink`, `accent-tint`, `accent-hover`),
surfaces/canvas, `ink` (buttons), text colours, font family, wordmark, and the copy name.
The system keeps: status colours + tints, `focus`, `border-input`, `disabled`,
`text-tertiary`, `text-inverse`, spacing, radii. `<html data-brand="drei|dreigo">` is the
whole swap; no second file. Adding a third operator = one new `brands:` entry whose contrast
table passes — no screen changes.

### Drei (base / default)
Host operator (MVNE). Identity white/black/blue, from drei.at. `accent` cyan `#00a0d2`
(graphic), `accent-ink` `#006a8e` (link/ring, ~5.4:1), `ink` navy `#0f273b` (buttons,
~13:1), `accent-tint` `#e0f3fa`. Default locale de-AT. Wordmark to be supplied; placeholder
until the official asset is available.

### DreiGo (second brand, the white-label proof)
Fictitious data-only MVNO on Drei. `accent` purple `#820ad1` (Nubank; ~5.6:1 on white, so
`accent-ink` = `accent`), `accent-tint` `#f0e5fb`, `ink` `#16181d`. Lime, if used, is a
decorative highlight only — never a link, a ring, or the only signal of a state. Default
locale en-US. Wordmark placeholder.

## Open items (reconfirm before shipping a brand)
- Run `tools/contrast.py` per brand and publish the full table (Phase 1.4). Hand-computed
  ratios here are order-of-magnitude, not the measured record.
- Drei official hex set is from drei.at CSS (accent `#00a0d2`, ink `#0f273b`); confirm with
  Drei brand guidelines if/when available, and confirm `accent-tint`/`text-primary` pairs.
- Official Drei and DreiGo wordmark assets.
- de-AT copy validation by Drei.
