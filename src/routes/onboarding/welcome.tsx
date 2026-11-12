import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useSyncOnboardingStep } from "@/hooks/use-sync-onboarding-step";
import { useTenant } from "@/hooks/use-tenant";
import { WizardPage } from "@/components/onboarding/wizard-page";
import { WizardNav } from "@/components/onboarding/wizard-nav";

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
  const { tenantName } = useTenant();
  const navigate = useNavigate();
  useSyncOnboardingStep("welcome");

  return (
    <WizardPage
      step="welcome"
      title={t("onboarding.welcome.title", "Welcome to {{brand}}", { brand: tenantName })}
      subtitle={t(
        "onboarding.welcome.subtitle",
        "Go from visitor to active prepaid customer in a few clear steps.",
      )}
    >
      <p className="type-body text-text-secondary">
        {t(
          "onboarding.welcome.body",
          "Pick a plan, get a number, create your account, and confirm — you can go back any time.",
        )}
      </p>
      <p className="mt-3 type-body text-text-secondary">
        {t(
          "onboarding.welcome.prepaidNote",
          "No contract and no surprises: your plan starts with your first top-up, and you can stop anytime.",
        )}
      </p>

      {/* First step: no Back. "See plans" names the result and reinforces offer-first (review R2). */}
      <WizardNav
        continueLabel={t("onboarding.welcome.cta", "See plans")}
        onContinue={() => navigate({ to: "/onboarding/plan" })}
      />
    </WizardPage>
  );
}
