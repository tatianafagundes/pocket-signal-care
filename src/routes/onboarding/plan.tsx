import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useSyncOnboardingStep } from "@/hooks/use-sync-onboarding-step";
import { TENANT_OFFERS_ESIM } from "@/lib/onboarding-context";
import { continueTarget } from "@/lib/onboarding-guard";
import { useOnboarding } from "@/hooks/use-onboarding";
import { useTenant } from "@/hooks/use-tenant";
import { WizardPage } from "@/components/onboarding/wizard-page";
import { WizardNav } from "@/components/onboarding/wizard-nav";
import { SeamErrorNotice } from "@/components/onboarding/seam-error-notice";
import { OfferOption } from "@/components/onboarding/offer-option";
import { AssistPanel } from "@/components/onboarding/assist-panel";
import { RadioGroup } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { api, asSeamFailure } from "@/services/api";
import { queryKeys } from "@/lib/query-keys";
import type { Recommendation } from "@/services/recommendation-rules";

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
  const { tenant } = useTenant();
  const { state, patch } = useOnboarding();
  const navigate = useNavigate();
  useSyncOnboardingStep("plan");

  const offersQuery = useQuery({
    queryKey: queryKeys.offers(tenant),
    queryFn: () => api.listOffers(tenant),
  });

  function selectOffer(offerId: string) {
    // B1: selecting a plan is the single source of the chosen plan. The review summary is rebuilt
    // from `selectedOfferId` at render, so there is no stale plan-derived cache to clear here.
    // One exception: if the new plan doesn't offer the SIM form chosen earlier, that choice is
    // cleared so Continue sends the user back through the SIM step instead of to Review.
    const offer = offersQuery.data?.find((o) => o.offerId === offerId);
    const simStillAllowed =
      state.simType == null || offer?.simTypes == null || offer.simTypes.includes(state.simType);
    patch(
      simStillAllowed ? { selectedOfferId: offerId } : { selectedOfferId: offerId, simType: null },
    );
  }

  const [suggestion, setSuggestion] = useState<Recommendation | null>(null);

  function chooseSuggested(offerId: string) {
    selectOffer(offerId);
    // Bring the chosen plan into view and focus its radio, so the choice is visible and the
    // keyboard / screen-reader position follows it. Wait a frame for the collapsed panel.
    requestAnimationFrame(() => {
      const radio = document.getElementById(`offer-${offerId}`);
      if (!radio) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      radio.focus({ preventScroll: true });
      radio.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    });
  }

  const next = continueTarget("plan", state, TENANT_OFFERS_ESIM);

  return (
    <WizardPage
      step="plan"
      title={t("onboarding.plan.title", "Choose a plan")}
      subtitle={t("onboarding.plan.subtitle", "Pick the plan that fits how you use your phone.")}
    >
      {offersQuery.isPending ? (
        <div className="grid gap-2" aria-hidden="true">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : offersQuery.isError ? (
        <SeamErrorNotice
          error={asSeamFailure(offersQuery.error, "catalog.listOffers")}
          onRetry={() => void offersQuery.refetch()}
        />
      ) : offersQuery.data.length === 0 ? (
        <p className="type-body text-text-secondary">
          {t("onboarding.plan.empty", "No plans are available right now.")}
        </p>
      ) : (
        <>
          <p className="mb-4 rounded-card bg-accent-tint p-3 type-caption text-accent-ink">
            {t(
              "onboarding.plan.paymentNote",
              "Prepaid, no contract: you only pay when you top up, and you can cancel anytime.",
            )}
          </p>
          <div className="mb-4">
            <AssistPanel
              offers={offersQuery.data}
              onChoose={chooseSuggested}
              onSuggestion={setSuggestion}
            />
          </div>

          <RadioGroup
            value={state.selectedOfferId ?? null}
            onValueChange={selectOffer}
            aria-label={t("onboarding.plan.title", "Choose a plan")}
          >
            {offersQuery.data.map((offer) => (
              <OfferOption
                key={offer.offerId}
                offer={offer}
                recommendedLabel={t("onboarding.plan.recommended", "Most popular")}
                {...(suggestion?.offerId === offer.offerId
                  ? { suggestedLabel: t("onboarding.plan.assist.resultLabel", "Suggested for you") }
                  : {})}
              />
            ))}
          </RadioGroup>

          <WizardNav
            onBack={() => navigate({ to: "/onboarding/welcome" })}
            onContinue={() => navigate({ to: `/onboarding/${next.to}` })}
            {...(next.returnsToReview
              ? { continueLabel: t("onboarding.nav.returnToReview", "Save and return to review") }
              : {})}
            continueDisabled={state.selectedOfferId == null}
            disabledHint={t("onboarding.plan.disabledHint", "Choose a plan to continue.")}
          />
        </>
      )}
    </WizardPage>
  );
}
