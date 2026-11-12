import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";

import {
  OnboardingContext,
  type OnboardingContextValue,
  type OnboardingPatch,
  type OnboardingState,
} from "@/lib/onboarding-context";
import {
  clearOnboardingState,
  initialOnboardingState,
  loadOnboardingState,
  saveOnboardingState,
} from "@/lib/onboarding-persistence";
import { useTenant } from "@/hooks/use-tenant";

/*
 * OnboardingProvider. (Spec Fase 5 / Req 1, 6.3, 9.1)
 *
 * Owns the wizard state for the current tenant, persists non-secret state to sessionStorage on
 * every patch (so a refresh resumes where the user was), and exposes `patch`/`reset`.
 *
 * Tenant pinning: the tenant is captured ONCE, from the tenant context at mount. If the brand
 * changes mid-flow the wizard keeps the tenant it started with — a half-finished Drei flow does
 * not silently become a DreiGo flow. (Persistence also refuses to resume another tenant's state.)
 *
 * SSR-safe: the state is initialised lazily. On the server `loadOnboardingState` returns the
 * clean initial state (no window); on the client's first render it reads sessionStorage. Because
 * the tenant context is `drei` on both server and first client render (hydration-safe), the
 * initial state matches across hydration.
 */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { tenant } = useTenant();

  // Pin the tenant for the life of this provider instance (the flow it started with).
  const tenantRef = useRef(tenant);

  const [state, setState] = useState<OnboardingState>(() => loadOnboardingState(tenantRef.current));

  const patch = useCallback((p: OnboardingPatch) => {
    setState((prev) => {
      const next: OnboardingState = { ...prev, ...p };
      saveOnboardingState(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    clearOnboardingState();
    setState(initialOnboardingState(tenantRef.current));
  }, []);

  const value = useMemo<OnboardingContextValue>(
    () => ({ state, patch, reset }),
    [state, patch, reset],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}
