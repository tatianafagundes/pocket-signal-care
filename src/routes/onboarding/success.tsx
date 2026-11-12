import { createFileRoute } from "@tanstack/react-router";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useSyncOnboardingStep } from "@/hooks/use-sync-onboarding-step";
import { WizardPage } from "@/components/onboarding/wizard-page";

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
  useSyncOnboardingStep("success");

  return (
    <WizardPage
      step="success"
      title={t("onboarding.success.title", "You're all set")}
      subtitle={t(
        "onboarding.success.subtitle",
        "Your plan is active. Make your first top up when you're ready.",
      )}
    >
      <p className="type-body text-text-secondary">
        {t("onboarding.success.placeholder", "A link to your plan will appear here.")}
      </p>
    </WizardPage>
  );
}
