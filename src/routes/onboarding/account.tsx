import { createFileRoute } from "@tanstack/react-router";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useSyncOnboardingStep } from "@/hooks/use-sync-onboarding-step";
import { WizardPage } from "@/components/onboarding/wizard-page";

export const Route = createFileRoute("/onboarding/account")({
  head: () => ({
    meta: [
      { title: "Create your account — whitelabel" },
      { name: "description", content: "Create the account that secures your prepaid service." },
      { property: "og:title", content: "Create your account — whitelabel" },
      {
        property: "og:description",
        content: "Create the account that secures your prepaid service.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { t } = useLocalizedTranslation();
  useSyncOnboardingStep("account");

  return (
    <WizardPage
      step="account"
      title={t("onboarding.account.title", "Create your account")}
      subtitle={t(
        "onboarding.account.subtitle",
        "Your email and a password keep your service safe.",
      )}
    >
      <p className="type-body text-text-secondary">
        {t("onboarding.account.placeholder", "The account form will appear here.")}
      </p>
    </WizardPage>
  );
}
