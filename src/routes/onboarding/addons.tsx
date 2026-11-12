import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useSyncOnboardingStep } from "@/hooks/use-sync-onboarding-step";
import { useOnboarding } from "@/hooks/use-onboarding";
import { useTenant } from "@/hooks/use-tenant";
import { WizardPage } from "@/components/onboarding/wizard-page";
import { WizardNav } from "@/components/onboarding/wizard-nav";
import { SeamErrorNotice } from "@/components/onboarding/seam-error-notice";
import { SelectableAddOn } from "@/components/onboarding/selectable-add-on";
import { Skeleton } from "@/components/ui/skeleton";
import { api, SeamFailure } from "@/services/api";

export const Route = createFileRoute("/onboarding/addons")({
  head: () => ({
    meta: [
      { title: "Add-ons — whitelabel" },
      { name: "description", content: "Add extras like more data, EU roaming or streaming." },
      { property: "og:title", content: "Add-ons — whitelabel" },
      {
        property: "og:description",
        content: "Add extras like more data, EU roaming or streaming.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AddOnsStep,
});

function AddOnsStep() {
  const { t } = useLocalizedTranslation();
  const { tenant } = useTenant();
  const { state, patch } = useOnboarding();
  const navigate = useNavigate();
  useSyncOnboardingStep("addons");

  const addOnsQuery = useQuery({
    queryKey: ["add-ons", tenant],
    queryFn: () => api.listAddOns(tenant),
  });

  function toggle(offerId: string, checked: boolean) {
    const current = state.selectedAddOnIds;
    const next = checked ? [...current, offerId] : current.filter((id) => id !== offerId);
    patch({ selectedAddOnIds: next });
  }

  return (
    <WizardPage
      step="addons"
      title={t("onboarding.addons.title", "Add extras")}
      subtitle={t(
        "onboarding.addons.subtitle",
        "Optional — boost your plan now, or skip and add them later.",
      )}
    >
      {addOnsQuery.isPending ? (
        <div className="grid gap-2" aria-hidden="true">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : addOnsQuery.isError ? (
        <SeamErrorNotice
          error={
            addOnsQuery.error instanceof SeamFailure
              ? addOnsQuery.error
              : new SeamFailure({
                  code: "catalog.listAddOns",
                  category: "unavailable",
                  retryable: true,
                })
          }
          onRetry={() => void addOnsQuery.refetch()}
        />
      ) : addOnsQuery.data.length === 0 ? (
        // No add-ons for this tenant — nothing to choose; move on.
        <p className="type-body text-text-secondary">
          {t("onboarding.addons.empty", "No add-ons are available for your plan right now.")}
        </p>
      ) : (
        <ul
          className="grid gap-3"
          aria-label={t("onboarding.addons.listLabel", "Available add-ons")}
        >
          {addOnsQuery.data.map((offer) => (
            <li key={offer.offerId}>
              <SelectableAddOn
                offer={offer}
                checked={state.selectedAddOnIds.includes(offer.offerId)}
                onToggle={(checked) => toggle(offer.offerId, checked)}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Optional step: Continue is always enabled; the label reflects whether any were chosen. */}
      <WizardNav
        onBack={() => navigate({ to: "/onboarding/plan" })}
        onContinue={() => navigate({ to: "/onboarding/number" })}
        continueLabel={
          state.selectedAddOnIds.length === 0
            ? t("onboarding.addons.skip", "Skip")
            : t("onboarding.nav.continue", "Continue")
        }
      />
    </WizardPage>
  );
}
