import { createFileRoute } from "@tanstack/react-router";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useSyncOnboardingStep } from "@/hooks/use-sync-onboarding-step";
import { WizardPage } from "@/components/onboarding/wizard-page";

export const Route = createFileRoute("/onboarding/number")({
  head: () => ({
    meta: [
      { title: "Pick your number — whitelabel" },
      { name: "description", content: "Choose and reserve your new mobile number." },
      { property: "og:title", content: "Pick your number — whitelabel" },
      { property: "og:description", content: "Choose and reserve your new mobile number." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NumberPage,
});

function NumberPage() {
  const { t } = useLocalizedTranslation();
  useSyncOnboardingStep("number");

  return (
    <WizardPage
      step="number"
      title={t("onboarding.number.title", "Pick your number")}
      subtitle={t(
        "onboarding.number.subtitle",
        "Choose a new mobile number and we'll hold it for you.",
      )}
    >
      <p className="type-body text-text-secondary">
        {t("onboarding.number.placeholder", "The number picker will appear here.")}
      </p>
    </WizardPage>
  );
}
