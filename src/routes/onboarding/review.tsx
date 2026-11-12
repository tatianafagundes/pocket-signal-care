import { createFileRoute } from "@tanstack/react-router";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useSyncOnboardingStep } from "@/hooks/use-sync-onboarding-step";
import { WizardPage } from "@/components/onboarding/wizard-page";

export const Route = createFileRoute("/onboarding/review")({
  head: () => ({
    meta: [
      { title: "Review and activate — whitelabel" },
      { name: "description", content: "Check your plan, number and account before you activate." },
      { property: "og:title", content: "Review and activate — whitelabel" },
      {
        property: "og:description",
        content: "Check your plan, number and account before you activate.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReviewPage,
});

function ReviewPage() {
  const { t } = useLocalizedTranslation();
  useSyncOnboardingStep("review");

  return (
    <WizardPage
      step="review"
      title={t("onboarding.review.title", "Review and activate")}
      subtitle={t(
        "onboarding.review.subtitle",
        "Check everything before you confirm — you can still go back and change it.",
      )}
    >
      <p className="type-body text-text-secondary">
        {t("onboarding.review.placeholder", "Your order summary will appear here.")}
      </p>
    </WizardPage>
  );
}
