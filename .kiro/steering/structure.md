---
inclusion: always
---

# Structure — where things live and the conventions that keep it consistent

## Directory map
```
src/
  routes/          TanStack file-based routes (pages). One <main> per view via PageShell.
                   #[[file:src/routes/README.md]]
  components/
    ui/            Vendored shadcn primitives — DO NOT edit to fix app bugs; wrap instead.
    <feature>/     App components grouped by feature (home/, my-plan/, account/, onboarding/, …).
  services/        The seam layer (integration). #[[file:src/services/README.md]]
    <seam>.functions.ts        public surface: Zod-validate → runRead/runWrite → driver
    <seam>-rules.ts            pure business rules (no I/O, no throw)
    <seam>/<seam>-{driver,mock,http}.ts
    model.ts                   canonical domain types (UI consumes these, never raw TMF)
    api.ts                     the single port: { api, SeamFailure, asSeamFailure }
    seam-result.ts / seam-runtime.ts / seam-logger.ts / mock-support.ts / driver-config.ts
  lib/             framework-free helpers (query-keys, formatting, onboarding logic, persistence)
  schemas/         Zod input schemas per seam (tenantIdSchema is the shared source of truth)
  locales/         en.json + de-AT.json (full parity, enforced by parity.test.ts)
  styles/          tokens.css (raw colours live ONLY here) + styles.css (utility bindings)
docs/              design decisions (docs/design), TMF/DXP contracts (docs/contracts), PHASES.md
design/            DESIGN.md — the design system
```

## Conventions that aren't obvious
- **The seam name-trap.** The folder is the business concept (`catalog`, `order`, `charging`) but
  the driver/env name is the DXP system (`ecm`, `eoc`, `ecev`). There is no `VITE_CATALOG_DRIVER` —
  it's `VITE_ECM_DRIVER`. The mapping lives in `driver-config.ts`. (Detailed in the services README.)
- **Pure rules are named per domain, not per seam.** CPR's rules live in `customer360-rules.ts`
  (not `cpr-rules.ts`) because they compose across seams.
- **`getCustomer360` is the one cross-seam fan-out** and it **degrades silently** — a failed
  order/charging/catalogue read yields empty/null, so one outage never blanks the screen. When
  wiring real systems, decide per screen whether "no plan / no balance" with no error is acceptable.
- **A brand must not change system tokens** (status, focus, spacing, radii) — only the
  `[data-brand]` block in `tokens.css`. Status is always colour + word, never colour alone.
- **Dev-only code self-guards** on `import.meta.env.DEV` (e.g. `dev-mock-controls.ts`,
  `DemoStateSwitcher`) so it tree-shakes / no-ops in production.

## Working rules for this repo specifically
- **Lovable edits the same branch concurrently.** `git pull` before starting each increment, and
  keep `main` in a working state (commits sync back to the Lovable editor).
- **Do not rewrite published history** (no force-push / rebase of pushed commits) — see AGENTS.md.
- **Smallest correct change.** Match existing style; don't refactor adjacent code that isn't broken.
- Full project rules (design/i18n/tenant/build, and what Lovable manages): #[[file:AGENTS.md]]
