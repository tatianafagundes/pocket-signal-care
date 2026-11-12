import { createFileRoute } from "@tanstack/react-router";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useSyncOnboardingStep } from "@/hooks/use-sync-onboarding-step";
import { WizardPage } from "@/components/onboarding/wizard-page";

export const Route = createFileRoute("/onboarding/welcome")({
  head: () => ({
    meta: [
      { title: "Get started — whitelabel" },
      {
        name: "description",
        content: "Join in a few clear steps: pick a plan, create your account, get a number.",
      },
      { property: "og:title", content: "Get started — whitelabel" },
      {
        property: "og:description",
        content: "Join in a few clear steps: pick a plan, create your account, get a number.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WelcomePage,
});

function WelcomePage() {
  const { t } = useLocalizedTranslation();
  useSyncOnboardingStep("welcome");

  return (
    <WizardPage
      step="welcome"
      title={t("onboarding.welcome.title", "Welcome")}
      subtitle={t(
        "onboarding.welcome.subtitle",
        "Go from visitor to active prepaid customer in a few clear steps.",
      )}
    >
      <p className="type-body text-text-secondary">
        {t(
          "onboarding.welcome.body",
          "Pick a plan, create your account, get a number, and confirm — you can go back any time.",
        )}
      </p>
    </WizardPage>
  );
}
