<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->
## Project rules — whitelabel MVNO self-care

This is a prepaid mobile **self-care** PWA, white-labelled across two brands
(**Drei** host + **DreiGo** MVNO) and integrated with the DXP **CPR** (the only real
backend; every other system is mocked behind a seam). The design system is
`design/DESIGN.md`.

### Design tokens & colour
- **Raw colours live only in `src/styles/tokens.css`.** `src/styles.css` binds them to
  Tailwind utilities and shadcn role variables. A component NEVER hardcodes a colour —
  use a utility (`bg-accent-tint`, `text-accent-ink`, `bg-primary`, …).
- **The accent is the brand; buttons are ink.** Primary buttons use `bg-primary`
  (= `--ink`), never the brand accent. Links/selection rings use `accent-ink`.
- **A brand is a theme**, set with `<html data-brand="drei|dreigo">`. To add or change a
  brand, edit the `[data-brand="…"]` block in `tokens.css` only — never a component.
- **A brand must not change system tokens**: status (success/warning/danger + tints),
  `focus`, `border-input`, `disabled`, `text-tertiary`, `text-inverse`, spacing, radii.
- **No box-shadow, no gradient (except the brand hero band), no uppercase labels.** Depth
  is hairline + surface contrast.
- Status is always **colour + word**, never colour alone. A brand accent is never red
  (it would collide with the `danger` system token).

### i18n
- Locales: **en-US (default) + de-AT**. Every UI string is a key in `src/locales/*.json`;
  zero hardcoded strings. Money/dates format by the active locale (EUR).

### Integration (seams)
- **CPR is the only real system.** ECM / EOC / ECEV / DSIMA are mocked behind connectors
  and flipped by env. Keep the canonical contracts and `SeamResult` discipline; never call
  a backend directly from a component.

### Tenant context
- Keep tenant context in a component-free shared module, the consumer hook in its own
  module, and the provider above the app shell; this preserves context identity during
  hot updates. Use the localized translation hook throughout the tenant shell and pages
  to keep each deferred boundary in the server language until its hydration finishes;
  automatic tenant and language updates also run in React transitions.

### Build / verify
- `export PATH="$HOME/.bun/bin:$PATH"` first (bun is not on the default PATH), then
  `bun run build` and `bun test` before pushing. Keep the connected branch in a working
  state (it syncs back to Lovable).
### Seam layer conventions (Fase 0+3)

- **Tests are colocated** as `*.test.ts` next to the source (e.g. `cpr.functions.test.ts`),
  not under a `__tests__/` folder. This is a deliberate deviation from the spec's
  `src/services/__tests__/` wording — colocation is the common Vitest convention and keeps a
  seam + its test together. (vitest.config includes `src/**/*.{test,spec}.{ts,tsx}`.)
- **Canonical domain types live in `src/services/model.ts`**, not `contracts/model/`. The
  OpenAPI files under `contracts/seams/` document the seam surface; there is no codegen, so a
  separate `contracts/model/` would just duplicate the TS types. (The reference repo does the
  same — canonical types in the service layer.)
- **Never-throw**: a seam returns `SeamResult`, never throws. `api.ts` is the only place a
  `{ok:false}` becomes a thrown `SeamFailure`. The UI imports only `{ api, SeamFailure }`.
- **Driver flip by env** is confined to `driver-config.ts` (`VITE_<SEAM>_DRIVER`, default mock).
  TMF mapping lives ONLY in a seam's `*-http.ts` client — never in the seam, a rule, or the UI.
- Onboarding step access is decided by the pure resolver in `src/lib/onboarding-guard.ts`, applied in the /onboarding layout on route change — keeps deep links from skipping steps.
