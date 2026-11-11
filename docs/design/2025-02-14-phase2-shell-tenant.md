# Design review — Phase 2: tenant resolution + app shell (whitelabel MVNO self-care)

Reviewed `design/DESIGN.md` (source of truth) and the prior round
`docs/design/2025-02-14-phase1-tokens-i18n-foundation.md` against the six Phase 2 components
(`app-header`, `bottom-tab-bar`, `language-selector`, `tenant-not-found-banner`, `page-shell`,
`tenant-provider`), plus `src/routes/__root.tsx`, `src/styles.css`, `src/styles/tokens.css`,
`src/i18n.ts`, `src/lib/tenant-rules.ts`, `src/locales/{en,de-AT}.json`.

**Review only — no code changed.** No app run, no visual verification (no Bash/browser).
Contrast ratios are hand-computed with the WCAG 2.x formula and carry the same "reconfirm with
`tools/contrast.py`" caveat the spec places on its own table; `tools/contrast.py` still does not
exist in the repo (carried over from Phase 1 as an open blocker for "a brand exists only when
its table passes").

## Promessa da tela
Phase 2 has no content screen yet; routes are placeholder PageShells. The promise is the
**shell contract**: *"every tenant resolves to a known brand with no hardcoded colour, the
app-bar + tab bar + language switch render in that brand using only design-system utilities, and
an unknown tenant recovers visibly to Drei."* This review judges whether that holds against the
régua — and flags where the shell is about to ship a sub-4.5:1 pairing the A1 exception never
covered.

## O que está resolvido
Do not touch these — correct and load-bearing.

- **Phase 1 B1/B2 are fixed.** `styles.css` now carries the 11 `@utility type-*` styles
  **verbatim** from the front-matter `typography:` block, role-named (`type-display-number`,
  `type-title`, `type-tab-label`, `type-control`, …). The invented styles and the uppercase
  `type-overline-11` (the Don't violation) are gone. `font-variant-numeric: tabular-nums` is on
  `type-display-number` and exposed as `tabular-figures`. This is the central Phase 1 finding,
  resolved.
- **Phase 1 B3 is fixed.** The `[data-theme="dark"]` block is removed; `styles.css` documents
  dark mode as out of scope with a comment explaining why. No invented neutral set ships.
- **The one-file-for-colour rule holds across all six components.** No hardcoded hex anywhere;
  every colour is a utility bound to a token. The `--color-accent-brand` / `bg-accent-brand`
  split (saturated brand kept off bare shadcn `bg-accent`) is implemented exactly as the comment
  in `styles.css` prescribes.
- **`page-shell.tsx` is correctly rebuilt** (fixes Phase 1 I2): 390px column, `rounded-card`
  (12px), 1px `border-hairline`, `bg-surface`, **no shadow**, `type-title` + `type-body`. The
  dead `shadow-soft`, `border-dashed`, `rounded-3xl`, `max-w-3xl` are all gone.
- **`app-header.tsx` dropped `bg-hero`** (fixes Phase 1 I1): flat `bg-surface` app-bar with a
  1px hairline under it, brand surface is a flat brand-tile. `bg-hero`/`--gradient-hero` survive
  only as an unused utility reserved for a future campaign band — not consumed by the shell.
- **Tenant resolution is sound.** `tenant-rules.ts` is pure, deterministic, SSR-safe; precedence
  (known subdomain > `?tenant=` > default) matches the comment; an unknown `?tenant=` never
  themes as that value, it recovers to Drei and reports `requestedUnknown`. `tenant-provider.tsx`
  resolves default-first for SSR/hydration stability, then re-resolves on the client — the
  hydration reasoning is correct.
- **Locale JSON is clean and complete.** All new keys (`app.*`, `tenant.*`, `nav.*`, `pages.*`)
  exist in **both** en and de-AT; en-US is sentence case; de-AT capitalises nouns correctly
  (Tarif, Guthaben, Konto, Zusatzpakete). No hardcoded strings in the JSON. The Phase 1
  Portuguese-fallback defect is gone — `bottom-tab-bar` fallbacks are now en-US and `"Top up"`
  (never "Recharge"), honouring the one-term rule.

## Achados

### Bloqueia entrega

**B1 — The brand-tile puts white text on flat Drei cyan `#0096c5` (~3.3:1): a NEW instance of
the sub-4.5:1 problem the A1 exception does NOT cover.**
`app-header.tsx`: `className="… bg-accent-brand … text-text-inverse"` renders `tenantName`
(white, `type-body-strong`, 16px/600) on `bg-accent-brand` = `--accent`. For Drei that is cyan
`#0096c5`; white on it is **~3.3:1** (the régua's own figure). This is the second frase — *does
it wrong and doesn't notice* — because it renders as deliberate brand chrome while failing text
contrast, and nobody computes it.

The régua scopes the A1 exception narrowly and twice: front-matter Drei note — *"shipped on the
primary button + hero only to match the brand"*; contrast table A1 row — *"scoped to primary
button + hero only"*; `tokens.css` — *"scoped to the PRIMARY BUTTON only."* **The brand-tile is
neither the primary button nor the hero.** So white-on-cyan here is an un-sanctioned fourth
surface, not a covered case. WCAG 1.4.3 (text contrast) is the criterion; the exception's own
wording is what it contradicts (fifth frase too — *contradicts a registered decision* about the
exception's scope).

Nuance that matters for the fix: the régua says the brand-tile holds the **white wordmark**
(an image asset, judged as a graphic ≥3:1, where ~3.3:1 passes). The code renders the tenant
**name as live text** as a documented placeholder "until the official asset arrives." So the
defect is specifically the **text placeholder**, not the eventual image. Two clean fixes, pick
one:
- Render the placeholder wordmark as text in **`text-primary`/`ink`** on the tile instead of
  white (Drei ink `#1f1f1f` on cyan `#0096c5` ≈ 5.9:1 — passes 4.5:1), accepting it looks less
  like the final white-on-brand wordmark; **or**
- Treat the placeholder as a graphic by shipping it as the actual wordmark image on the tile
  (then ~3.3:1 is the ≥3:1 graphic floor, consistent with how the régua treats the real asset),
  and keep the `aria-label` for the name.

Do **not** silently extend A1 to the tile — if white-on-cyan text on the tile is genuinely
wanted, that is a new scoped exception that must be written into DESIGN.md with its own table
row, not assumed. DreiGo is unaffected (white on `#820ad1` ≈ 5.6:1, passes).

**B2 — Language pills are 32px tall — below the 44px the régua mandates (and the pattern can't
even fall back to the 24px AA floor cleanly).**
`language-selector.tsx`: `className="min-h-8 … px-3 …"`. `min-h-8` = 32px. Régua Layout: *"Tap
targets 44 px minimum"*; front-matter `spacing.tap: 44px`. This is a hard house rule, stricter
than WCAG. WCAG 2.5.8 (AA) floor is 24×24 with spacing; **2.5.5 (AAA) is 44×44** — the régua has
adopted the AAA target as its own minimum, which is the right call for a PWA that runs on a phone
held in one hand. At 32px the pills miss the régua rule by 12px. The two pills sit in a
`gap-1` (4px) row, so the 2.5.8 "undersized target with 24px spacing" escape does not obviously
apply either. This is the first/fourth frase for a touch user: *the thumb misses the target, or
takes two tries.* **Fix:** give each pill `min-h-11` (44px) — or if the app-bar height (`h-14`,
56px) can't hold two 44px pills plus padding, raise the bar or move the selector, but 32px is not
compliant with the régua. Note the régua's own hedge ("buttons 52px; tap targets 44px min") — a
pill toggle is a tap target, so 44px, not 52px.

**B3 — Every number this product will show is money/data/time, and the shell ships no money
provenance primitive — but more concretely for Phase 2: the not-found banner and the tab bar are
the only live text, and neither is the blocker here; the blocker is that `app.name` is being
called as a default-value where the code intends an interpolation, so the app-bar can render the
literal brand name through a mismatched i18next overload.**
`app-header.tsx`: `aria-label={t("app.name", tenantName)}`. In i18next, `t(key, secondArg)` with
a **string** second arg is the *default value* overload — it does **not** interpolate
`tenantName` into the string. Since `app.name` exists in both locales as `"whitelabel"`, the call
returns **`"whitelabel"`**, so the tile's `aria-label` is `"whitelabel"` while the **visible text
is `tenantName`** ("Drei"/"DreiGo"). That is a 1.4.1-adjacent / 4.1.2 defect: the accessible name
("whitelabel") disagrees with the visible label ("Drei"). A screen-reader user hears "whitelabel";
a sighted user sees "Drei". The brief flagged this as a "mismatch risk" — confirmed, it is an
actual mismatch, not a risk. **Fix:** the accessible name should equal the visible brand name.
Simplest: `aria-label={tenantName}` (the visible text already *is* the name, so the span arguably
needs no aria-label at all — the text content is the accessible name). If a localized "{{name}}
home" label is wanted, add a real key with an interpolation placeholder (`"app.brandLabel":
"{{name}}"`) and call `t("app.brandLabel", { name: tenantName })`. As written it is the
name/role/value failure, so it blocks.

### Vale corrigir

**S1 — The active tab renders `text-accent-ink` on an `accent-tint` pill; the régua's "text on
accent-tint is text-primary, never accent" rule needs an explicit tab carve-out, and the pairing
must be contrast-checked for both brands.**
`bottom-tab-bar.tsx`: active = `data-[status=active]:text-accent-ink` with
`group-data-[status=active]:bg-accent-tint` behind the icon. Two things to separate:

1. **Does it contradict the Selection rule?** The régua Selection section says both: *"active tab
   = accent-ink (Drei) / accent (DreiGo)"* **and** *"Text on accent-tint is text-primary, never
   accent."* These are in tension for the tab specifically. Reading them together, the active-tab
   line is the **more specific rule** and names accent-ink as the active-tab colour explicitly, so
   the tab is best read as a sanctioned exception to the general tint rule — but the régua never
   says so in words. This is a *contradicts* risk that should be resolved by **one sentence in
   DESIGN.md** ("the active tab is the one place accent-ink labels sit on accent-tint"), not by
   changing the code. Flagging so the ambiguity is closed in the spec, not left for the next dev
   to rediscover.
2. **Contrast of accent-ink text/icon on accent-tint, both brands** (brief item 2, computed):
   - Drei: `accent-ink #0073a0` on `accent-tint #e0f3fa` ≈ **3.6:1**. The label is `type-tab-label`
     = 11px/500 — **small text**, needs **4.5:1**. **~3.6:1 fails 1.4.3 for the text label.** The
     icon (a graphic, ≥3:1) passes. So the active **tab label** is a sub-4.5:1 failure for Drei —
     the same hazard family as B1, caught here by the small type size.
   - DreiGo: `accent-ink #820ad1` on `accent-tint #f0e5fb` ≈ **4.8:1** — passes 4.5:1 for text,
     comfortably for the icon.

   Drei's active-tab **label** therefore fails. Note the active label also sits on `bg-surface`
   (white) for the text portion — the tint is only behind the **icon** (`group-…:bg-accent-tint`
   is on the inner `span.h-7.w-12`, which wraps the icon only; the label `span` is on the white
   nav surface). Re-reading the markup: the **label** is `accent-ink` on **surface white**
   (`#0073a0` on `#fff` ≈ 4.6:1 — passes), and only the **icon** sits on the tint (`#0073a0` on
   `#e0f3fa` ≈ 3.6:1, a graphic ≥3:1 — passes). So as structured, **both pass** their applicable
   floor. The risk is a future refactor that moves the tint behind the label too; lock it with a
   comment + the DESIGN.md sentence from (1). Downgraded from blocker to Vale corrigir on that
   re-read — but the régua clarification is still needed so this stays true.

**S2 — Tab active state is conveyed by colour + a tint pill, but not programmatically: no
`aria-current`.** `bottom-tab-bar.tsx` uses TanStack `<Link>`, which sets `data-status="active"`
(a data attribute the CSS keys off) but **does not set `aria-current`**. WCAG 1.4.1 (colour
alone) is satisfied visually — there is a tint-pill shape change behind the icon, not just colour
— but 4.1.2 (name/role/value) wants the current item exposed to AT. **Fix:** set
`aria-current="page"` on the active link. TanStack Router doesn't emit it automatically; either
read the link's active state via its render-prop/`activeProps` and set
`aria-current={isActive ? "page" : undefined}`, or add `activeProps={{ "aria-current": "page" }}`.
Without it, a screen-reader user can't tell which tab is current. (The visual non-colour signal
exists, so this is 4.1.2, not 1.4.1 — correcting the brief's framing: the pill *is* a non-colour
signal.)

**S3 — The not-found banner uses `role="status"`; for a tenant that silently became a different
brand, `role="alert"` (assertive) is the better match — but `status` is defensible.** The banner
(`tenant-not-found-banner.tsx`) announces that the app recovered from an unknown `?tenant=` to
Drei. `role="status"` = `aria-live="polite"` (announced at the next pause). Because the banner is
present on first render (not injected after an action) and the recovery already happened, polite
is arguably right — the user isn't mid-task and nothing is time-critical. But the content is a
*correction of the user's explicit request* (they asked for tenant X, got Drei), which leans
toward `role="alert"`. **Recommendation:** keep `role="status"` **if** the banner is guaranteed
present at initial paint (it is, when `requestedUnknown` is set on first client resolve) — a
polite region that exists at load is fine. If it can appear **after** mount (it can: the provider
re-resolves in an effect, so on the client the banner mounts *after* first paint), then a polite
live region that's inserted late may not announce reliably across AT; `role="alert"` is the safer
choice for a late-inserted recovery notice. Given the effect-driven mount, **prefer
`role="alert"`.** Either way it is not a blocker — colour+word+icon are all present (1.4.1 fine).

### Refinamento (preferência declarada)

**R1 — `EN`/`DE` pill labels are hardcoded in the component, not in the locale JSON.**
`language-selector.tsx`: `short: "EN"` / `"DE"` are literals in the `LOCALES` array. These are
language *endonyms/abbreviations* and conventionally stay untranslated, so this is defensible —
but the régua says *"every UI string is a key; zero hardcoded strings."* The full `aria-label`s
(`"English (US)"`, `"Deutsch (AT)"`) are also hardcoded. Preference: move them to keys for
consistency with the stated rule, or accept them as locale-invariant and note the exception. Low
stakes; flagging only because the régua's wording is absolute.

**R2 — `app.name` = `"whitelabel"` in both locales is still the Phase 1 placeholder.** Fine as a
placeholder, but once B3 is fixed by using `tenantName` directly, the `app.name` key may become
unused for the tile. Decide whether `app.name` still has a consumer (meta title in `__root.tsx`
uses a literal `"whitelabel — …"`, not the key) or should be removed to avoid a dead key.

## Acessibilidade — WCAG 2.2 AA
| Critério | O que está errado | Correção | Aparece num ACR? |
|---|---|---|---|
| 1.4.3 | **B1** — white on Drei cyan brand-tile ~3.3:1 (text placeholder). A1 exception does not cover the tile. | Ink text on the tile (~5.9:1), or ship the wordmark as an image (graphic ≥3:1). | Yes — 1.4.3 is an ACR line; and the A1 note already is a documented ACR caveat. Extending it silently would widen the ACR gap. |
| 2.5.5 / 2.5.8 | **B2** — language pills 32px (`min-h-8`); régua min is 44px (adopts the 2.5.5 AAA target). | `min-h-11` (44px) per pill; adjust app-bar height if needed. | 2.5.8 (AA, 24px) is the ACR floor and 32px clears *that*; but the régua's own 44px rule is stricter and is what fails. Note both. |
| 4.1.2 | **B3** — app-bar tile accessible name ("whitelabel") ≠ visible text (brand name). | `aria-label={tenantName}` or a real interpolation key. | Yes — 4.1.2 Name, Role, Value. |
| 4.1.2 | **S2** — active tab not exposed via `aria-current`. | `aria-current="page"` on the active link. | Yes — 4.1.2. |
| 1.4.3 | **S1** — Drei active-tab icon on tint ~3.6:1 (passes as graphic); label on white ~4.6:1 (passes). No failure *as structured*, but locked only by the label being on surface not tint. | Keep label off the tint; add DESIGN.md sentence + code comment. | Would appear only if refactored wrong; note as a watch-item. |
| 4.1.3 | Forward-looking: the active-tab change and the locale switch are state changes with no status-message announcement. Not blocking for a nav bar (the route change itself is announced by the router), but the **language switch** changes the whole UI language with no spoken confirmation. | When Phase 2+ adds content, ensure locale switch announces (e.g. a polite live region "Language set to English"). | Yes — 4.1.3 Status Messages. |
| 1.4.11 | `border-input` #858c96 on white ~3.1:1 (carried from Phase 1) — no input controls in this shell yet, so not triggered, but the language pills have **no border** and rely on tint fill for the active state — fine. | No action this phase; re-check when real inputs land. | Yes. |
| 2.4.7 | **No `:focus-visible` ring is defined yet** (carried from Phase 1 — the `--focus`/`--ring` token exists, no rule uses it). The language pills and tab links are keyboard-focusable **with no visible focus style** beyond the browser default, which `transition-colors` + custom bg can suppress. | Add the 2px `focus` ring utility and apply it to the pills, tab links and the banner link. This is now *live* (Phase 2 ships focusable controls), so it graduates from "note" to a real AA gap. | Yes — 2.4.7 Focus Visible. |

Raising **2.4.7 to a Vale corrigir in practice**: Phase 1 could defer it (no controls); Phase 2
ships three sets of focusable controls (language pills, six tab links, the banner link) with no
defined focus-visible style. The token exists but nothing applies it. Add it with B2's fix.

## Estados faltando
Shell-level, not screen-level:
- **Language selector has no disabled/pending state** — switching locale is synchronous here, so
  acceptable; note for when locale load becomes async.
- **The not-found banner has no dismiss.** It persists for the session whenever `?tenant=` is
  unknown. Acceptable (the "Go to Drei" link resolves it by stripping the param), but there is no
  way to acknowledge-and-keep-browsing without navigating. Minor; not required by the régua.
- **Tab bar has exactly one active state and a hover** — the six-tab fixed set matches the régua.
  No empty/loading/error applies to a static nav. Good.

## Carga — o que perguntei e o que ficou sem resposta
Shell carries no data, so load is light. Open questions forwarded:
- **Brand name length on the tile.** The tile is `h-8 px-3` with the brand **name as text**.
  "Drei"/"DreiGo" fit; a future third tenant with a longer name could overflow a fixed-width
  52×32 tile (the régua's brand-tile is 52×32). The code uses `h-8` (32px) + `px-3` auto width,
  not a fixed 52px, so it flexes — but the régua says the tile is **52×32**. Mismatch: the code
  tile isn't 52px wide. Resolve whether the tile is fixed 52×32 (régua) or name-width-flexible
  (code). Suspends nothing, but the régua says 52×32 and the code says auto-width.
- **`requestedUnknown` string length.** The raw `?tenant=` value is interpolated into the banner
  (`{{requested}}`). A very long or multi-line URL value would stretch the banner text. See i18n
  note below; the `min-w-0 flex-1` + `type-body-sm` wrap it, so layout is safe, but the displayed
  string is attacker-controlled (see i18n/escaping).

## Papéis
No role-gated UI in the shell (no auth in this demo, per the régua: *"this demo does not
authenticate"*). The language selector is available to everyone. No role matrix needed this phase.

## Aderência ao sistema
Régua usada: **`design/DESIGN.md`** (single DESIGN.md in the repo; found at the path in the
brief). Prior round `docs/design/2025-02-14-phase1-…md` read and diffed — Phase 1 B1/B2/B3 and
I1/I2 are resolved (see "O que está resolvido"); no regressions against Phase 1 decisions found.

- **Token/role fidelity (brief item 1): clean.** No hardcoded colour, no arbitrary hex, no
  ad-hoc `text-[11px]` — Phase 1's inline `text-[11px]` in the tab bar is **gone**, replaced by
  `type-tab-label`. No arbitrary type sizes in any of the six components. The only arbitrary
  values are `max-w-[390px]` / `min-h-[56px]` (layout, not colour/type) — 390px is the régua
  `phone-width` so it's the system value expressed as an arbitrary Tailwind class (acceptable;
  could be tokenised but the régua gives no `max-w-phone` utility). `min-h-[56px]` on the tab
  link is a tap-target height ≥44px — fine.
- **Shape/layout (brief item 4): mostly on-scale.** `rounded-tile` (tile, 8px) on the brand-tile
  ✓; `rounded-pill` on pills/language toggle ✓; `rounded-control` on the banner ✓ (12px — the
  régua has no dedicated banner radius; control/card 12px is the right pick); `rounded-card` on
  the page-shell card ✓. **Off-scale:** `min-h-8` (32px, B2) is not a tap value; `h-7` (28px) and
  `h-8` (32px) and `h-14` (56px) are raw heights — 56px/44px are fine as container heights but
  none map to a spacing token name (the régua spacing scale has no 28/32/56; `h-14` app-bar is a
  reasonable container height, `h-7` icon-pill is decorative). The one that matters is `min-h-8`.
- **System-token leakage (brief item 7): none.** No brand block in `tokens.css` touches a system
  token (status, focus, border-input, disabled, text-tertiary, text-inverse, spacing, radii) —
  both `[data-brand]` blocks override only accent*/button-primary*/ink/text-primary/text-secondary
  /campaign*/gradient-hero, exactly the régua's allow-list. The components consume
  `text-warning`/`bg-warning-tint` (status, system) in the banner and `text-text-inverse` (system)
  on the tile — reading system tokens is correct; none is overridden by a brand.
- **"No shadow / no gradient except hero / no uppercase": holds.** No `box-shadow` anywhere;
  `bg-hero` (the one allowed gradient) exists but is **not consumed** by the shell; no
  `uppercase` / `text-transform` in any component or utility (the Phase 1 overline is deleted).
  Sentence case holds in both locales.

## Escrita — antes → depois
All strings already en-US sentence case and consistent with the one-term rule. Two items:

| Onde | Está (en) | Proposta (en) | Por quê |
|---|---|---|---|
| `tenant-not-found-banner` / `tenant.notFound` | `We couldn't find "{{requested}}". Showing Drei instead.` | `We couldn't find the "{{requested}}" account. Showing Drei instead.` (optional) | "find X" alone is slightly ambiguous about *what* X is (a tenant? a page?). Naming the thing ("account"/"brand") reads clearer. Minor; current string is acceptable. The literal quotes around `{{requested}}` are good — they bound the untrusted value visually. |
| `tenant-not-found-banner` / `tenant.goToDrei` | `Go to Drei` | keep | Correct: names the destination, not the mechanic. ✓ |

No new product concepts introduced, so no `docs/glossario-en.md` entry needed this phase. "Top
up", "My plan", "Add-ons", "Account", "Support" all match the régua's fixed set and one-term rule.

## i18n — brief item 6
- **`t("app.name", tenantName)` mismatch: confirmed and real (B3).** It's the i18next
  default-value overload, not interpolation; returns `"whitelabel"`, so `aria-label` ≠ visible
  text. See B3.
- **`{{requested}}` interpolation of a raw URL value: display is safe, escaping is covered.**
  `i18n.ts` sets `interpolation: { escapeValue: false }` (correct for React, which escapes JSX
  text nodes itself). The banner renders `{t("tenant.notFound", { requested })}` as a **JSX text
  child**, so React HTML-escapes it — no XSS even though the value is attacker-controlled from the
  URL. The remaining concern is **display length / content**, not injection: a very long or
  whitespace/emoji `?tenant=` value renders literally inside the quotes. `min-w-0 flex-1` +
  wrapping `type-body-sm` keep layout intact. **Recommend** clamping the displayed value (e.g.
  truncate to ~24 chars with an ellipsis) so a pathological URL can't produce a wall of text —
  purely cosmetic hardening, not a security fix. Do **not** remove the quotes; they frame the
  untrusted span.
- **de-AT coverage: complete.** Every key used by the six components exists in de-AT
  (`app`, `tenant.notFound/goToDrei/language`, all six `nav.*`, all `pages.*`). No missing-key
  fallback will fire for German. ✓

## Preciso saber antes
- **Is the brand-tile a fixed 52×32 (régua) or name-width-flexible (code `h-8 px-3`)?** If the
  official wordmark images are 52×32, the tile should be fixed and B1's second fix (ship the
  image) is the clean path. If it stays a text placeholder indefinitely, B1's ink-text fix
  applies. This changes *which* B1 fix to take, not B1's severity.
- **Does DESIGN.md intend the active tab as a sanctioned exception to "text on accent-tint is
  text-primary, never accent"?** If yes, add the sentence (S1) and the code is fine. If no, the
  active-tab accent-ink treatment itself needs rethinking. Suspends S1's resolution.
- **Should the not-found banner announce assertively?** Depends on whether product wants the
  recovery to interrupt (alert) or wait for a pause (status). Suspends S3's final call.
- **Is `tools/contrast.py` expected to exist before Phase 2 signs off?** Still absent; the régua
  requires it before a brand ships. My ratios (B1 ~3.3:1, S1 Drei ~3.6:1 icon-on-tint / ~4.6:1
  label-on-white, DreiGo ~4.8:1) are hand-computed and need the tool to become the measured
  record. Suspends final sign-off on every contrast cell above.

## Limites desta revisão
- **No visual verification.** No Bash/browser; the app was not run. Everything is read from
  source. All contrast ratios are hand-computed with the WCAG formula and carry the régua's own
  "reconfirm with `tools/contrast.py`" caveat — treat ~3.3 / ~3.6 / ~4.6 / ~4.8 as
  order-of-magnitude, not the measured record. In particular, **whether the Drei active-tab tint
  sits behind the label or only the icon** I reasoned from the markup nesting (tint is on the
  inner icon `span`, label is on the nav surface) — a rendered contact sheet would confirm it;
  that re-read is what moved S1 from blocker to Vale corrigir, so if the render disagrees, S1
  returns to blocker.
- **No contact sheet / no rendered states.** Have the main thread run `ui-capture` (it needs
  Bash, which I don't have) and send the sheet if you want observed confirmation of B1, S1 and the
  focus-ring gap.
- **No Figma link provided** → paridade Figma↔código: **não avaliada**.
- `wireframe-review` (multi-state diff) and `fixing-accessibility` (HTML auto-fix) both need Bash
  and are out of my reach — run them in the main thread if you want the cross-state diff and the
  automated a11y pass.
- `tools/contrast.py` does not exist in the repo (searched); the "brand exists only when its
  table passes" gate is still open from Phase 1.
- I did not exhaustively scan `src/components/ui/**` (shadcn primitives) beyond the six components
  in the brief; `__root.tsx`'s own 404/error components use raw `text-sm`/`text-xl`/`rounded-md`
  shadcn classes rather than `type-*` utilities, which is pre-existing Lovable scaffold outside
  the Phase 2 scope — noted, not scored.
