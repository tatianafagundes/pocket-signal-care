# Design review — Phase 1: token + i18n foundation (whitelabel MVNO self-care)

Reviewed: `design/DESIGN.md` (source of truth) against `src/styles/tokens.css`,
`src/styles.css`, `src/routes/__root.tsx`, `src/locales/{en,de-AT}.json`, `src/i18n.ts`,
and the three inherited Lovable components (`app-header`, `bottom-tab-bar`, `page-shell`).

This is a **review of what Phase 1 implemented**. No code was changed. Phase 1 scope was
tokens/CSS/i18n only — screens/components are Phase 2 — so the inherited components are
judged for *what renders wrong today*, not held to the Phase 2 bar.

## Promessa da tela
Phase 1 has no screen. Its promise is narrower and testable: **"any Phase 2 component that
uses a utility/role gets a colour, type, radius and string that matches `DESIGN.md`, and
`data-brand` is the whole brand swap."** The review judges whether that contract holds.

## O que está resolvido
Do not touch these — they are correct and load-bearing.

- **tokens.css colour values** match the `DESIGN.md` front matter exactly, base + both
  brands. Every hex (`--accent` cyan `#00a0d2`, `--accent-ink` `#006a8e`, `--ink` `#0f273b`
  for Drei; `#820ad1` / `#f0e5fb` / `#16181d` for DreiGo; all status + tints) is a faithful
  copy. No colour drift found in tokens.css.
- **The one-file-for-colour rule holds.** Colours live only in tokens.css; styles.css binds
  via `var(--…)`; components read roles/utilities. No hardcoded brand hex in a component.
- **The brand-swap boundary is clean in the token layer.** Both `[data-brand]` blocks
  override only `accent*`, `ink`, `text-primary`, `button-primary-hover`. No status, focus,
  border-input, spacing or radii leaks into a brand block. (Dark theme is the exception —
  see Blocker 3.)
- **"Buttons are ink, not brand"** is correctly wired: `--primary: var(--ink)` and
  `--accent-role: var(--accent-tint)` with `--accent-foreground: var(--accent-ink)`. shadcn
  `bg-primary` = ink, `bg-accent` = tint. The split DESIGN.md asks for is in place.
- **Radii nulling** is done: shadcn `--radius-sm/md/lg/xl/2xl/3xl` are all remapped to the
  token scale (8/12/12/20/20/20), so shadcn's default radii can't leak.
- **i18n.ts** matches DESIGN.md: `en` default, `de-AT` second, `fallbackLng: en`,
  `supportedLngs` locked, zero hardcoded strings in the locale JSON.

## Achados

### Bloqueia entrega

**B1 — The type scale in styles.css is a different scale from `DESIGN.md`; it contradicts
the source of truth on 10 of 13 styles.**
`styles.css` lines with `@utility type-*` define a scale that does not exist in the
front-matter `typography:` block. This is the fifth frase: *contradicts a registered
decision* — `DESIGN.md` is declared the source of truth and the code diverges from it.
Every Phase 2 screen that uses these utilities will render the wrong scale, and the drift
is invisible until someone diffs against the spec (which is what happened here).

Divergences (DESIGN.md → styles.css):

| DESIGN.md token | DESIGN.md spec | styles.css `@utility` | Divergence |
|---|---|---|---|
| `display-number` | 40px / 44 / 700 / -0.02em | `type-display-32` 32/38/700/-0.01em | size 40→32, lh 44→38, tracking -0.02→-0.01 |
| `title` | 24px / 30 / **600** / -0.01em | `type-title-24` 24/30/**700**/-0.01em | weight 600→700 |
| (none) | — | `type-title-20` 20/26/600 | invented style, not in spec |
| `heading` | **18px** / 24 / 600 | `type-heading-17` **17**/23/600 | size 18→17, lh 24→23 |
| `body` | 16 / 24 / 400 | `type-body-16` 16/24/400 | ✓ matches |
| `body-strong` | 16 / 24 / 600 | `type-body-16-strong` 16/24/600 | ✓ matches |
| (none) | — | `type-body-15` 15/22/400 | invented style, not in spec |
| `body-sm` | 14 / 20 / 400 | `type-body-sm-14` 14/20/400 | ✓ matches |
| `body-sm-strong` | 14 / 20 / 600 | `type-body-sm-14-strong` 14/20/600 | ✓ matches |
| (none) | — | `type-label-13` 13/18/500 | invented style, not in spec |
| `caption` | 12 / 16 / **500** | `type-caption-12` 12/16/**400** | weight 500→400 |
| (none) | — | `type-caption-12-strong` 12/16/600 | invented style, not in spec |
| `tab-label` | 11 / 14 / 500 | — | **missing** — no 11px/500 utility |
| `tab-label-strong` | 11 / 14 / 600 | — | **missing** |
| `control` | 16 / 20 / 600 | — | **missing** — button label style absent |
| (none) | — | `type-overline-11` 11/14/600/0.06em **uppercase** | invented + violates a Don't (see B2) |

Net: `display-number` (the single most important style — "the only big thing on a screen is
the number that matters") is 8px too small and under-tracked; `title` and `caption` have the
wrong weight; `heading` is 1px off; `control`, `tab-label`, `tab-label-strong` don't exist;
four non-spec styles were invented. **Fix:** regenerate the `@utility` block from the
front-matter `typography:` block verbatim, named to match (`type-display-number`,
`type-title`, `type-heading`, …, `type-tab-label`, `type-control`). Delete the invented
styles unless they are added to `DESIGN.md` first.

**B2 — `type-overline-11` ships `text-transform: uppercase`, which violates an explicit
Don't.**
`styles.css` `@utility type-overline-11 { … text-transform: uppercase; }`. `DESIGN.md`
Typography: *"No uppercase eyebrow labels."* and Do's/Don'ts: *"Don't add shadows,
gradients, photography or **uppercase labels**."* and Elevation: *"no uppercase."* Three
separate rules. This is *contradicts a registered decision*. The style has no spec origin at
all (there is no overline/eyebrow in the type scale). **Fix:** delete `type-overline-11`.

**B3 — Dark theme is scope creep built on invented, unverified values; it will ship broken
colour on dark.**
`styles.css` `[data-theme="dark"]` block. Phase 1 scope is "tokens/CSS/i18n adapted from the
system." Dark mode is not in `DESIGN.md` — not a token, not a brand, not an open item. The
block invents eight neutral hexes (`--canvas:#0e1014`, `--surface:#16181d`, … `--hairline:#2a2e35`)
that appear in no source, and the code comment admits it ("for Fase 1 we invert the neutral
roles here and keep brand accents"). Two concrete breakages, not just scope:

- **Brand accents are kept unchanged on dark.** Drei `accent-tint #e0f3fa` and DreiGo
  `#f0e5fb` are near-white washes designed for a white surface. On `--surface #16181d` they
  become near-white blocks; `--accent-foreground` (`accent-ink` `#006a8e` / `#820ad1`) on a
  near-white tint is the *light-on-light* failure the whole accent-ink split exists to
  prevent. Any `bg-accent` + `text-accent-foreground` pairing (chips, selected rows,
  option-rows — core components) is unreadable on dark.
- **No contrast table exists for dark**; `DESIGN.md` says a brand only "exists" when its
  table passes, and dark has none.

This is the second frase (*does it wrong and doesn't notice*): a Phase 2 dev toggling
`data-theme="dark"` gets a surface that looks intentional but has unreadable accent
components. **Fix:** remove the `[data-theme="dark"]` block from Phase 1. If dark mode is
wanted, it is its own spec item with its own token set and its own contrast table.

### Vale corrigir

**S1 — shadcn radius aliases over-collapse: `rounded-lg` → 12px and `rounded-xl/2xl/3xl` →
20px will silently round-up inherited components.** `styles.css` `--radius-lg:12px`,
`--radius-xl/2xl/3xl:20px`. The system has exactly two card/control radii (12) and one sheet
radius (20); page-shell's `rounded-3xl` now resolves to 20px (sheet), not an error but a
*wrong-token* — a card rendered at sheet radius. Acceptable as a bridge, but note it: once
Phase 2 rebuilds components to `rounded-card`, drop the `xl/2xl/3xl` aliases so a stray
`rounded-3xl` fails loudly instead of resolving to a plausible-but-wrong radius.

**S2 — `--gradient-hero` / `bg-hero` has no basis in `DESIGN.md` and contradicts "no
gradient".** `styles.css` `--gradient-hero: linear-gradient(...)` and `@utility bg-hero`.
Elevation & Depth: *"None. No shadow, no gradient…"* and Don'ts: *"Don't add shadows,
gradients…"*. The brand surface in the system is the **brand-tile** (a flat `accent`
rectangle), not a gradient band. `bg-hero` is consumed by app-header (see I1). This is
*contradicts a registered decision*; it's Should-fix rather than Blocker only because it's a
utility no Phase 2 screen is required to use. **Fix:** remove `bg-hero`/`--gradient-hero`;
the header brand surface should be flat `accent` per the brand-tile rule.

**S3 — `display-swap` Inter is loaded via remote `@import`-equivalent `<link>` — correct —
but styles.css explicitly forbids remote font `@import`; confirm the link path is the
intended one.** `__root.tsx` loads Inter via `<link href="https://fonts.googleapis.com/…">`,
which is the method styles.css's own header comment prescribes ("Load those with a `<link>`
in the head()"). So this is correct and consistent — flagged only to confirm it was
intentional and not a leftover, since it's the one network dependency in the foundation.
No change needed if offline/self-hosted fonts aren't a Phase 1 requirement.

### Refinamento (preferência declarada)

**R1 — Naming: utilities are named by pixel size (`type-body-16`) while `DESIGN.md` names by
role (`body`).** Preference, but role-named utilities survive a scale change (if `body`
becomes 15px you don't rename every call site). Recommend role names when B1 is fixed.

## Acessibilidade — WCAG 2.2 AA

Ratios below recomputed by hand with the WCAG 2.x formula to check the spec's "reconfirm"
cells. **`tools/contrast.py` does not exist in the repo** (searched) though `DESIGN.md`
Phase 1.4 and the Open items require it before a brand ships — that is itself an open
blocker for "a brand exists only when its table passes."

| Criterion | O que está errado | Correção | Aparece num ACR? |
|---|---|---|---|
| 1.4.11 | Drei `accent` #00a0d2 on **canvas** #f5f6f8 ≈ **2.7:1** — below the 3:1 non-text floor. The spec marks this pair "reconfirm" and the data-ring / unread-dot use `accent` on canvas. On canvas (not white) it fails the graphic floor. | On canvas, the data-ring/unread-dot must use `accent-ink` #006a8e (≈4.3:1 on canvas) or thicken to a filled shape that doesn't rely on the 3:1 stroke contrast. Decide per component in Phase 2; record here so it isn't missed. | Yes — EN 301 549 / 1.4.11 is an ACR line |
| 1.4.3 / 1.4.11 | The two "reconfirm" **text-on-tint** pairs are actually fine on their own surfaces: `text-primary` navy/ink on `accent-tint` #e0f3fa and #f0e5fb both compute ≈14–15:1. Not a failure — but still *unverified by tool*. | Run the tool and publish; downgrade from "reconfirm" to a measured number. | Yes |
| 1.4.11 | `border-input` #858c96 on white ≈ 3.1:1 — passes 3:1 by a hair. DESIGN.md claims 3.4:1; hand calc is closer to 3.1. On `surface-tint`/`canvas` it drops below 3:1. | Verify with the tool on every surface the input sits on, not just white. | Yes |
| (no criterion yet) | **No focus-visible style is defined in Phase 1.** `--focus`/`--ring` tokens exist and bind to `--color-ring`, but there is no `:focus-visible` rule or ring utility in styles.css. 2.4.7 (focus visible) and 2.4.11 (focus not obscured) can't be satisfied by a token alone. | Phase 2 must add the 2px focus ring; flag now so it's not assumed "done" because the token exists. | Yes — 2.4.7 |

The accent-ink role split itself is **correct** per WCAG 2.2: Drei cyan reserved for graphics
≥3:1 on white (≈2.9:1 — note: below even 3:1 on white, so "graphic on white" is also tight;
the spec's own note concedes this and routes glyphs/rings to accent-ink, which is the right
call), links/rings on accent-ink ≥4.5:1, button label text-inverse on ink ≫4.5:1. DreiGo
purple ≈5.6:1 serving as its own accent-ink is correct.

## Estados faltando
N/A for Phase 1 (no screens). The absence to flag forward: **no skeleton/empty/error token
or utility** was introduced, and no focus-visible style (above). Phase 2 state components
have no foundation primitive yet — expected, but note it so Phase 2 doesn't assume they exist.

## Carga — o que perguntei e o que ficou sem resposta
N/A for a token/i18n foundation — no data renders. One forward-looking question for Phase 2:
tabular-nums is required by DESIGN.md for money/data/time but **no `font-variant-numeric`
utility or base rule exists** in styles.css. Add it with the type scale fix (B1) so money
columns align from the first screen.

## Papéis
N/A — no role-gated UI in Phase 1. DESIGN.md defines no role matrix; neither does the code.
Not a gap for this phase.

## Aderência ao sistema
Régua usada: `design/DESIGN.md` (found at the path given; single DESIGN.md in repo).
- Token values: **faithful** (see "O que está resolvido").
- Type scale: **divergent** — B1, the central finding.
- "No uppercase / no gradient / no shadow": **two violations** present in utilities
  (B2 uppercase, S2 gradient). No `box-shadow` found anywhere — shadow discipline holds, and
  `shadow-soft` referenced by page-shell resolves to nothing (I2).
- Brand-swap boundary: **clean** except dark theme (B3).

## Escrita — antes → depois
The locale JSON is clean and already sentence-case in en-US. The issues are in the
**inherited components' fallback strings**, which are Portuguese — a different language from
both supported locales (en-US, de-AT). These are the second arg to `t(key, fallback)` and
will show if a key ever misses.

| Onde | Está (en/current) | Proposta (en) | Por quê |
|---|---|---|---|
| `bottom-tab-bar.tsx` TABS fallbacks | `"Início"`, `"Meu plano"`, `"Recarga"`, `"Pacotes"`, `"Conta"`, `"Ajuda"` | `"Home"`, `"My plan"`, `"Top up"`, `"Add-ons"`, `"Account"`, `"Support"` | Fallbacks must match the en-US default locale and DESIGN.md's fixed tab set; `"Recarga"` also violates "one term per concept: **Top up** (not Recharge)" — here it's literally the wrong language *and* the forbidden synonym. |
| `app-header.tsx` tagline fallback | `"Seu celular pré-pago, do seu jeito"` | `"Your prepaid mobile, your way"` | Portuguese fallback; en.json already has the correct `"Your prepaid mobile, your way"`. |
| `app-header.tsx` name fallback | `"whitelabel"` | keep | Matches en.json; fine as a placeholder brand name. |

Note: these are fallbacks, so they only surface on a missing key. Still a defect — a German
user with a missing key would see Portuguese. Lower priority than B1–B3 but trivially fixed.

## Build de demo
Not a demo build — this is foundation code. N/A.

## Preciso saber antes
- **Is dark mode in Phase 1 scope?** If yes, it needs its own token set + contrast table and
  this review's B3 becomes "build it properly" rather than "remove it." If no (my reading of
  the brief), remove the block. This suspends B3's resolution, not its severity.
- **Where should `tools/contrast.py` live and is it expected in Phase 1?** DESIGN.md Phase
  1.4 requires it before a brand ships; it's absent. This suspends final sign-off on every
  "reconfirm" accessibility cell.
- **Are the invented type styles (`type-body-15`, `type-label-13`, `type-title-20`,
  `type-caption-12-strong`) deliberate additions to be ratified into DESIGN.md, or Lovable
  leftovers?** This changes B1's fix from "delete" to "add to spec first."

## Limites desta revisão
- **No visual verification.** I have no Bash/browser and did not run the app; everything here
  is read from source (tokens, CSS, TSX, JSON). Contrast ratios are hand-computed with the
  WCAG formula and carry the same "reconfirm with the tool" caveat the spec itself places on
  them — treat my 2.7:1 / 3.1:1 figures as order-of-magnitude, not the measured record.
- **No contact sheet / no rendered states** — I could not confirm how `bg-accent`,
  `bg-hero` or the dark block actually render; the breakages in B3/S2/I-items are reasoned
  from the token math, not observed. If you want observed confirmation, have the main thread
  run `ui-capture` and send the sheet.
- **No Figma link provided** → paridade: não avaliada.
- `wireframe-review` (multi-state diff) and `fixing-accessibility` (HTML fix) both need Bash
  and are out of my reach; the cross-state and auto-fix passes they'd give were not run.
- The repo is outside my workspace root, so `grep_search`/`file_search` did not index it; I
  read each file directly instead. I did **not** exhaustively scan `src/components/ui/**`
  (shadcn primitives) for other dead-token references beyond the three components in the brief.

---

## Inherited components vs the new system (brief item 5) — what renders wrong until Phase 2

These are expected gaps (components aren't rebuilt until Phase 2), listed so Phase 2 knows
exactly what to fix. All are *contradicts the system* findings.

**I1 — `app-header.tsx` uses `bg-hero` (a gradient) + brand surface that the system forbids.**
`<header className="bg-hero text-primary-foreground">`. `bg-hero` is the forbidden gradient
(S2); DESIGN.md's only brand surface is the flat `brand-tile`. Renders a gradient band today.
Phase 2: replace with flat `accent` brand-tile + white wordmark.

**I2 — `page-shell.tsx` references three dead/forbidden tokens.**
`className="… rounded-3xl border border-dashed border-border bg-card p-10 shadow-soft"`:
- `shadow-soft` — **does not exist** (no such utility/shadow in styles.css; the system has no
  shadows). Resolves to nothing → silently no-ops today; a dev may think a shadow is applied.
- `border-dashed` — DESIGN.md: *"cards have hairline borders not dashed."* Renders a dashed
  border, wrong.
- `rounded-3xl` — resolves to 20px (sheet radius) via the alias (S1); a card should be 12px.
Also uses `font-display text-3xl font-bold` for the title instead of a `type-*` utility, and
`max-w-3xl` instead of the 390px phone width — the whole component is desktop-Lovable, not
the 390px phone shell. Phase 2: rebuild as a card (`surface`, 1px hairline, 12px, no shadow)
at phone width.

**I3 — `bottom-tab-bar.tsx` active state uses the wrong colour and shape, has 6 hardcoded PT
fallbacks, and renders `bg-accent` (tint) as the active pill.**
- `data-[status=active]:text-primary` — `primary` is now **ink navy**, not the brand. DESIGN.md:
  active tab = `accent-ink` (Drei) / `accent` (DreiGo). Active tab renders ink, not brand.
- `group-data-[status=active]:bg-accent` — `bg-accent` = `accent-tint` wash (the role), which
  is *correct* as a selected wash, but the label colour on it is wrong (above), so the pill
  and label disagree.
- The 6 tabs match the DESIGN.md set (Home · My plan · Top up · Add-ons · Account · Support) —
  good — but every fallback label is Portuguese and `"Recarga"` breaks the Top-up term rule
  (see Escrita).
- `text-[11px]` inline instead of the (missing) `type-tab-label` utility — depends on B1.
Phase 2: active label → `text-accent-ink`, keep tint pill, use `type-tab-label`.

**I4 — `__root.tsx` sets `<html lang="en" data-brand="drei">`** — correct per DESIGN.md
("Ship with data-brand"). But DESIGN.md says **Drei's default locale is de-AT**, and i18n.ts
+ this `lang="en"` default the app to en. Minor: the per-brand default-locale rule ("Drei →
de-AT") is not wired anywhere (the i18n comment says "applied at the TenantProvider" which
doesn't exist yet). Flag forward for Phase 2; not a Phase 1 blocker since en is the stated
product default and de-AT is draft.
