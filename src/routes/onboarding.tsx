import { createFileRoute, Outlet } from "@tanstack/react-router";

import { OnboardingProvider } from "@/components/onboarding-provider";

/*
 * Onboarding layout route (/onboarding). (Spec Fase 5 / Req 1)
 *
 * The parent of every wizard step. It mounts the OnboardingProvider once, so the shared wizard
 * state (and its sessionStorage persistence) lives for the whole flow and survives navigation
 * between steps. The individual steps render through <Outlet />.
 *
 * Visiting /onboarding with no step is not a page itself — the welcome step is /onboarding/welcome.
 * (A redirect from the bare path to /welcome can be added with the entry CTA in Fase D.)
 */
export const Route = createFileRoute("/onboarding")({
  component: OnboardingLayout,
});

function OnboardingLayout() {
  return (
    <OnboardingProvider>
      <Outlet />
    </OnboardingProvider>
  );
}
