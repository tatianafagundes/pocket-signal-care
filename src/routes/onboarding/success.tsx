import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useSyncOnboardingStep } from "@/hooks/use-sync-onboarding-step";
import { useOnboarding } from "@/hooks/use-onboarding";
import { WizardPage } from "@/components/onboarding/wizard-page";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/onboarding/success")({
  head: () => ({
    meta: [
      { title: "You're all set — whitelabel" },
      { name: "description", content: "Your prepaid plan is active. Welcome aboard." },
      { property: "og:title", content: "You're all set — whitelabel" },
      { property: "og:description", content: "Your prepaid plan is active. Welcome aboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SuccessPage,
});

function SuccessPage() {
  const { t } = useLocalizedTranslation();
  const { state, reset } = useOnboarding();
  useSyncOnboardingStep("success");

  // Snapshot the name BEFORE resetting (reset clears state). Lazy init runs once.
  const [name] = useState(() => state.givenName ?? "");

  // The flow is done: clear the wizard so a refresh/back doesn't resurrect a completed onboarding.
  useEffect(() => {
    reset();
    // reset is stable (useCallback); run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const title = name
    ? t("onboarding.success.title", "You're all set, {{name}}", { name })
    : t("onboarding.success.titleNoName", "You're all set");

  return (
    <WizardPage
      step="success"
      title={title}
      subtitle={t("onboarding.success.subtitle", "Your plan is active.")}
    >
      {/* Balance starts null for a new prepaid customer — say "no balance yet", never "€0.00". */}
      <p className="type-body text-text-secondary">
        {t(
          "onboarding.success.balanceEmpty",
          "You have no balance yet — make your first top up to start using your plan.",
        )}
      </p>

      <Button asChild className="mt-6 w-full">
        <Link to="/my-plan">{t("onboarding.success.goToPlan", "Go to my plan")}</Link>
      </Button>
    </WizardPage>
  );
}
