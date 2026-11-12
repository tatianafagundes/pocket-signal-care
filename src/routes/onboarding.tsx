import { useEffect } from "react";
import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";

import { OnboardingProvider } from "@/components/onboarding-provider";
import { useOnboarding } from "@/hooks/use-onboarding";
import { ONBOARDING_STEPS, type OnboardingStep } from "@/lib/onboarding-context";
import { resolveOnboardingStep } from "@/lib/onboarding-guard";

/*
 * Onboarding layout route (/onboarding). Mounts the OnboardingProvider once so wizard state lives
 * for the whole flow, and guards deep links: a step that isn't reachable yet redirects to the
 * first unfinished step.
 */
export const Route = createFileRoute("/onboarding")({
  component: OnboardingLayout,
});

function OnboardingLayout() {
  return (
    <OnboardingProvider>
      <StepGuard />
      <Outlet />
    </OnboardingProvider>
  );
}

function StepGuard() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { state } = useOnboarding();
  const navigate = useNavigate();

  // Evaluate on route change only: success resets the state after it mounts, which must not
  // bounce the user away from the success screen.
  useEffect(() => {
    const segment = pathname.split("/")[2] ?? "";
    if (!(ONBOARDING_STEPS as readonly string[]).includes(segment)) return;
    const target = segment as OnboardingStep;
    const allowed = resolveOnboardingStep(target, state);
    if (allowed !== target) {
      void navigate({ to: `/onboarding/${allowed}`, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
