import { useEffect } from "react";
import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";

import { OnboardingProvider } from "@/components/onboarding-provider";
import { useOnboarding } from "@/hooks/use-onboarding";
import {
  ONBOARDING_STEPS,
  TENANT_OFFERS_ESIM,
  type OnboardingStep,
} from "@/lib/onboarding-context";
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
  const { state, restored } = useOnboarding();
  const navigate = useNavigate();

  // Re-evaluate on both route AND state change, so a fast navigation never guards against a
  // previous render's state. Success is exempt explicitly: it resets the state after it mounts,
  // and the guard must never bounce the user away from the success screen.
  useEffect(() => {
    // Wait for saved progress: guarding against the clean pre-restore state would bounce a
    // reloading user back to the first step.
    if (!restored) return;
    const segment = pathname.split("/")[2] ?? "";
    if (!(ONBOARDING_STEPS as readonly string[]).includes(segment)) return;
    const target = segment as OnboardingStep;
    if (target === "success") return;
    // Pass the same offersEsim truth WizardPage uses, so the guard gates /sim/delivery exactly as
    // the chrome shows them (no accidental reliance on the parameter default).
    const allowed = resolveOnboardingStep(target, state, TENANT_OFFERS_ESIM);
    if (allowed !== target) {
      void navigate({ to: `/onboarding/${allowed}`, replace: true });
    }
  }, [pathname, state, navigate, restored]);

  return null;
}
