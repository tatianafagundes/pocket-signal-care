# pocket-signal-care

A white-label **prepaid mobile self-care PWA** for two brands — **Drei** (host MNO) and **DreiGo**
(a fictional MVNO) — built as a faithful demo of the DXP (Digital Experience Platform) stack.
Customers manage their own line: balance, usage, top-ups, add-ons, plan, and onboarding.

React + TypeScript · TanStack Router/Start (SSR) · TanStack Query · Vite · Tailwind v4 + shadcn/ui.

## Quick start

> **Bun** is the package manager/runner and is **not on the default PATH**.

```bash
export PATH="$HOME/.bun/bin:$PATH"
bun install
bun run dev            # dev server on http://localhost:8080
```

Verify a change before pushing (all four should pass; lint baseline is 0 errors / 7 pre-existing
`react-refresh` warnings):

```bash
bun run build && npx tsc --noEmit && bun run test && bun run lint
```

No `.env` is needed — every backend runs on an in-memory **mock** driver by default. To point a
seam at a real backend, see `.env.example` and the services README below.

## How it's built (the one idea to grasp first)

The UI never calls a backend directly. It imports only `{ api, SeamFailure }`; `api` calls a
**seam**; a seam validates input and delegates to a **driver** (mock today, http later). A seam
never throws — it returns a `SeamResult`. Swapping mock→real is an env flag plus one `*-http.ts`
file; nothing else changes.

```
UI → api.ts → <seam>.functions.ts → driver (mock | http)
```

## Where to read next

| You want to… | Read |
|---|---|
| Understand the seam layer (anatomy, name-trap, wiring a real system) | [`src/services/README.md`](src/services/README.md) |
| Know the project-wide rules (design tokens, i18n, tenant, what Lovable manages) | [`AGENTS.md`](AGENTS.md) |
| Follow the design system | [`design/DESIGN.md`](design/DESIGN.md) |
| See what shipped, phase by phase | [`docs/PHASES.md`](docs/PHASES.md) |
| Map a seam to the real DXP/TMF system it stands in for | [`docs/contracts/`](docs/contracts/) |
| Understand the routes/pages | [`src/routes/README.md`](src/routes/README.md) |

If you work with **Kiro**, the steering in [`.kiro/steering/`](.kiro/steering/) (product / tech /
structure) loads this context automatically and references the docs above.

## Build with Lovable

This project is connected to [Lovable](https://lovable.dev) and can be developed in the
[Lovable editor](https://lovable.dev/projects/8886405c-1c50-4ea0-9349-a0599c753c01).

- **Stay in sync**: every change made in Lovable is committed straight to this repository, and
  commits pushed to `main` sync back into the editor — so keep `main` in a working state.
- **Full ownership**: the code is yours.

## Conventions worth knowing up front

- **Two brands, one codebase.** A brand is a theme (`<html data-brand>`), set only in
  `src/styles/tokens.css` — never a code fork.
- **Bilingual, zero hardcoded strings.** en-US + de-AT, full parity (enforced by a test).
- **Money is minor units** (euro cents); format by locale in the UI.
- **Tests are colocated** (`*.test.ts` next to the source) and run fast (mock latency is off in test).
- **Lovable edits this branch too** — `git pull` before each change, keep `main` working, don't
  rewrite pushed history.
