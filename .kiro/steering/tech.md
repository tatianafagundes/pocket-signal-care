---
inclusion: always
---

# Tech — stack, verification, and the rules that don't bend

## Stack
- **React + TypeScript**, **TanStack Router/Start** (SSR), **TanStack Query** (data layer).
- **Vite** build, **Vitest** tests, **ESLint + Prettier**, **Tailwind v4** + shadcn/ui.
- **Bun** is the package manager/runner — and it is **not on the default PATH**.

## Verify before you push (run all four, in the repo root)
```
export PATH="$HOME/.bun/bin:$PATH"
bun run build && npx tsc --noEmit && bun run test && bun run lint
```
- Lint baseline is **`7 problems (0 errors, 7 warnings)`** — the 7 are pre-existing `react-refresh`
  warnings in `src/components/ui/*` (vendored shadcn). 0 errors is the bar; those 7 warnings are OK.
- i18n parity between `src/locales/en.json` and `src/locales/de-AT.json` is enforced by
  `src/locales/parity.test.ts` — adding a key to one locale means adding it to the other.

## The seam layer — the one architecture rule to internalise first
The UI never calls a backend directly. Full anatomy, the name-trap, and the "wire a real system"
playbook are here — read it before touching `src/services`: #[[file:src/services/README.md]]

The rules that never bend:
- **A seam never throws.** It returns `SeamResult<T>` (`{ok:true,data}` | `{ok:false,error}`). The
  ONLY place a failure becomes an exception is `api.ts` (`unwrap` → `SeamFailure`).
- **The UI imports only `{ api, SeamFailure }`** from `@/services/api` — never a seam, a driver, or
  a raw TMF shape.
- **TMF/REST shapes live only in `<seam>-http.ts`.** Not in a seam, a rule, or the UI.
- **Pure business rules** (`*-rules.ts`, e.g. `customer360-rules.ts`) have no I/O and never throw —
  that's what makes them unit-testable without a backend.
- **Money is minor units** (euro cents) everywhere; format by locale in the UI.
- **Driver choice is env, confined to `driver-config.ts`** (`VITE_<SEAM>_DRIVER`, default mock).
  `assertDriverConfig()` fails the boot on an incoherent http config.

## Query, keys, errors
- React Query keys come from the typed factory in `src/lib/query-keys.ts` — never inline a key
  literal. QueryClient defaults (staleTime, retryable-aware retry) live in `src/router.tsx`.
- A query's error branch uses `asSeamFailure(query.error, "<seam.op>")` from `api.ts`.

## Observability
- Every seam op logs via `src/services/seam-logger.ts` (metadata only — never PII). A fan-out
  (`getCustomer360`) threads ONE `correlationId` through its sub-reads. Swap the sink for a real
  collector in Fase 8 without touching a seam.

## Testing
- Tests are **colocated** (`*.test.ts` next to the source), not in a `__tests__/` folder.
- Simulated mock latency is OFF under test (`MODE==="test"`), so suites are fast and deterministic.
- Add tests for new pure rules and seam behaviour; don't add UI render tests that fight the router.
