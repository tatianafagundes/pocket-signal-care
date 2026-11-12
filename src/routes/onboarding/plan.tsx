import { createFileRoute } from "@tanstack/react-router";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useSyncOnboardingStep } from "@/hooks/use-sync-onboarding-step";
import { WizardPage } from "@/components/onboarding/wizard-page";

export const Route = createFileRoute("/onboarding/plan")({
  head: () => ({
    meta: [
      { title: "Choose a plan — whitelabel" },
      { name: "description", content: "Compare prepaid plans and pick the one that fits." },
      { property: "og:title", content: "Choose a plan — whitelabel" },
      { property: "og:description", content: "Compare prepaid plans and pick the one that fits." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlanPage,
});

function PlanPage() {
  const { t } = useLocalizedTranslation();
  useSyncOnboardingStep("plan");

  return (
    <WizardPage
      step="plan"
      title={t("onboarding.plan.title", "Choose a plan")}
      subtitle={t("onboarding.plan.subtitle", "Pick the plan that fits how you use your phone.")}
    >
      <p className="type-body text-text-secondary">
        {t("onboarding.plan.placeholder", "The plan grid will appear here.")}
      </p>
    </WizardPage>
  );
}
