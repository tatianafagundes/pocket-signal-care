import { clearForcedError, forceError, isForced } from "@/services/mock-support";

/*
 * DEV-only mock controls. (Fase E — exercising recovery paths in the running app)
 *
 * The mock's forced-error switch (mock-support) is module state with no runtime surface. This
 * exposes it on `window.__mock` so a human (or the ui-capture harness) can arm a seam failure in
 * the running app — e.g. `window.__mock.forceError("catalog.listOffers")` then reload the plan
 * step to see the error + retry state — WITHOUT a real backend outage.
 *
 * SECURITY: the whole body is behind `import.meta.env.DEV`. In a production build that branch is
 * statically false, so the bundler tree-shakes this out entirely — there is NO window hook, and
 * no way to arm a failure, in prod. It is also a no-op on the server (no window). This mirrors the
 * auth fail-safe philosophy: dev convenience, zero production surface.
 *
 * Call installDevMockControls() once at startup (imported by the root). It self-guards.
 */

declare global {
  interface Window {
    __mock?: {
      forceError: (op: string) => void;
      clearForcedError: (op?: string) => void;
      isForced: (op: string) => boolean;
    };
  }
}

export function installDevMockControls(): void {
  if (!import.meta.env.DEV) return;
  if (typeof window === "undefined") return;
  window.__mock = { forceError, clearForcedError, isForced };
  // A quiet breadcrumb so a developer knows the handle exists.
  console.debug("[dev] window.__mock ready — forceError('<seam>.<op>') to arm a mock failure");
}
