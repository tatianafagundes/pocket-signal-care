import { createFileRoute } from "@tanstack/react-router";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useSyncOnboardingStep } from "@/hooks/use-sync-onboarding-step";
import { WizardPage } from "@/components/onboarding/wizard-page";

export const Route = createFileRoute("/onboarding/details")({
  head: () => ({
    meta: [
      { title: "Your details — whitelabel" },
      { name: "description", content: "Tell us your name to personalize your account." },
      { property: "og:title", content: "Your details — whitelabel" },
      { property: "og:description", content: "Tell us your name to personalize your account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DetailsPage,
});

function DetailsPage() {
  const { t } = useLocalizedTranslation();
  useSyncOnboardingStep("details");

  return (
    <WizardPage
      step="details"
      title={t("onboarding.details.title", "Your details")}
      subtitle={t(
        "onboarding.details.subtitle",
        "Just your name — we'll use it to set up your profile.",
      )}
    >
      <p className="type-body text-text-secondary">
        {t("onboarding.details.placeholder", "The details form will appear here.")}
      </p>
    </WizardPage>
  );
}
