import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useSyncOnboardingStep } from "@/hooks/use-sync-onboarding-step";
import { useOnboarding } from "@/hooks/use-onboarding";
import { useTenant } from "@/hooks/use-tenant";
import { WizardPage } from "@/components/onboarding/wizard-page";
import { WizardNav } from "@/components/onboarding/wizard-nav";
import { SeamErrorNotice } from "@/components/onboarding/seam-error-notice";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, SeamFailure } from "@/services/api";
import { formatMsisdn, formatPrice, offerPriceLabel } from "@/lib/format";
import { runOnboardingSubmit, type SubmitStep } from "@/lib/onboarding-submit";

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
  const { tenant, locale } = useTenant();
  const { state, patch } = useOnboarding();
  const navigate = useNavigate();
  useSyncOnboardingStep("review");

  // The submit steps plus a "finalizing" phase (warming Customer 360 after the order completes).
  const [busyStep, setBusyStep] = useState<SubmitStep | "finalizing" | null>(null);
  const [terminalError, setTerminalError] = useState<SeamFailure | null>(null);

  // The summary is rebuilt from state at RENDER (B1): the offer is looked up fresh from the grid,
  // so changing the plan upstream can never leave a stale price/plan in the summary.
  const offersQuery = useQuery({
    queryKey: ["offers", tenant],
    queryFn: () => api.listOffers(tenant),
  });
  const offer = offersQuery.data?.find((o) => o.offerId === state.selectedOfferId);
  // Compute the price label once: calling offerPriceLabel twice could, under a concurrent locale
  // change between calls, mix a key from one locale with args from another.
  const priceLabel = offer ? offerPriceLabel(offer, locale) : null;
  const planPrice = priceLabel ? t(priceLabel.key, priceLabel.args) : "";

  // Chosen add-ons, rebuilt from state at render (B1): looked up fresh against the add-on list.
  const addOnsQuery = useQuery({
    queryKey: ["add-ons", tenant],
    queryFn: () => api.listAddOns(tenant),
  });
  const selectedAddOns = (addOnsQuery.data ?? []).filter((o) =>
    state.selectedAddOnIds.includes(o.offerId),
  );

  const complete =
    state.selectedOfferId != null &&
    state.reservedMsisdn != null &&
    state.email != null &&
    state.givenName != null &&
    state.familyName != null;

  async function confirm() {
    setTerminalError(null);
    try {
      const customerId = await runOnboardingSubmit({
        state,
        patch,
        onStep: (step) => setBusyStep(step),
      });
      // Orchestration announced each step (incl. submitOrder) already; now the finishing phase.
      setBusyStep("finalizing");
      // Warm the 360 so the success/my-plan screens have it; degrade-silent if it fails.
      await api.getCustomer360(customerId).catch(() => undefined);
      await navigate({ to: "/onboarding/success" });
    } catch (err) {
      if (err instanceof SeamFailure) {
        setTerminalError(err);
      } else {
        throw err;
      }
    } finally {
      setBusyStep(null);
    }
  }

  const busy = busyStep != null;

  return (
    <WizardPage
      step="review"
      title={t("onboarding.review.title", "Review and activate")}
      subtitle={t(
        "onboarding.review.subtitle",
        "Check everything before you confirm — you can still go back and change it.",
      )}
    >
      {/* Per-step progress announcement during submit (WCAG 4.1.3). */}
      <p className="sr-only" role="status">
        {busyStep ? t(`onboarding.review.progress.${busyStep}`, "Activating…") : ""}
      </p>

      {offersQuery.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          {terminalError ? (
            <SeamErrorNotice
              error={
                // A terminal activation failure: the account is saved; offer a retry. Force the
                // category to "unavailable" so retryable:true stays consistent with the SeamError
                // invariant (only "unavailable" is retryable).
                new SeamFailure({
                  code: terminalError.code,
                  category: "unavailable",
                  retryable: true,
                  customerFacing: { key: "onboarding.review.terminalError" },
                })
              }
              onRetry={() => void confirm()}
              className="mb-4"
            />
          ) : null}

          <dl className="grid gap-4">
            <SummaryRow
              label={t("onboarding.review.plan", "Plan")}
              value={offer ? `${offer.name} · ${planPrice}` : "—"}
              onChange={() => navigate({ to: "/onboarding/plan" })}
              changeLabel={t("onboarding.review.change", "Change")}
              busy={busy}
            />
            <SummaryRow
              label={t("onboarding.review.addOns", "Add-ons")}
              value={
                selectedAddOns.length > 0
                  ? selectedAddOns
                      .map((a) => `${a.name} · ${formatPrice(a.priceMinor, a.currency, locale)}`)
                      .join(", ")
                  : t("onboarding.review.noAddOns", "None")
              }
              onChange={() => navigate({ to: "/onboarding/addons" })}
              changeLabel={t("onboarding.review.change", "Change")}
              busy={busy}
            />
            <SummaryRow
              label={t("onboarding.review.number", "Number")}
              value={state.reservedMsisdn ? formatMsisdn(state.reservedMsisdn) : "—"}
              onChange={() => navigate({ to: "/onboarding/number" })}
              changeLabel={t("onboarding.review.change", "Change")}
              busy={busy}
            />
            <SummaryRow
              label={t("onboarding.review.name", "Name")}
              value={[state.givenName, state.familyName].filter(Boolean).join(" ") || "—"}
              onChange={() => navigate({ to: "/onboarding/account" })}
              changeLabel={t("onboarding.review.change", "Change")}
              busy={busy}
            />
            <SummaryRow
              label={t("onboarding.review.account", "Account")}
              value={state.email ?? "—"}
              onChange={() => navigate({ to: "/onboarding/account" })}
              changeLabel={t("onboarding.review.change", "Change")}
              busy={busy}
            />
          </dl>

          <p className="mt-4 type-caption text-text-secondary">
            {t(
              "onboarding.review.balanceNote",
              "You start with no balance — top up any time to use your plan.",
            )}
          </p>

          {!complete ? (
            <p className="mt-4 type-caption text-destructive" role="alert">
              {t(
                "onboarding.review.incomplete",
                "Some steps are missing. Go back and complete them first.",
              )}
            </p>
          ) : null}

          <WizardNav
            onBack={() => navigate({ to: "/onboarding/account" })}
            onContinue={() => void confirm()}
            continueLabel={t("onboarding.review.confirm", "Confirm and activate")}
            continueDisabled={!complete}
            busy={busy}
          />
        </>
      )}
    </WizardPage>
  );
}

interface SummaryRowProps {
  label: string;
  value: string;
  onChange: () => void;
  changeLabel: string;
  busy: boolean;
}

function SummaryRow({ label, value, onChange, changeLabel, busy }: SummaryRowProps) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <dt className="type-caption text-text-secondary">{label}</dt>
        <dd className="type-body text-text-primary">{value}</dd>
      </div>
      <Button type="button" variant="link" size="sm" onClick={onChange} disabled={busy}>
        {changeLabel}
      </Button>
    </div>
  );
}
