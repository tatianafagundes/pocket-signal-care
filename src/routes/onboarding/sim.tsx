import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useSyncOnboardingStep } from "@/hooks/use-sync-onboarding-step";
import { useOnboarding } from "@/hooks/use-onboarding";
import { useTenant } from "@/hooks/use-tenant";
import { WizardPage } from "@/components/onboarding/wizard-page";
import { WizardNav } from "@/components/onboarding/wizard-nav";
import { SeamErrorNotice } from "@/components/onboarding/seam-error-notice";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { api, SeamFailure } from "@/services/api";
import type { SimChoice } from "@/services/model";

/*
 * /onboarding/sim — physical SIM vs eSIM. (Fase 7.5)
 *
 * Only reachable when the tenant offers eSIM (WizardPage/guard handle that). The choice narrows the
 * rest of the flow: eSIM skips /delivery (no shipping); physical requires a delivery address. The
 * offer's `simTypes` (absent = both) limits which forms are offered — an eSIM-only or physical-only
 * plan shows just that one. The chosen form is the proof the step had an effect (My plan later
 * shows "eSIM" vs "Physical SIM").
 */

export const Route = createFileRoute("/onboarding/sim")({
  head: () => ({
    meta: [
      { title: "Choose your SIM — whitelabel" },
      { name: "description", content: "Pick a physical SIM or an eSIM for your new line." },
      { property: "og:title", content: "Choose your SIM — whitelabel" },
      { property: "og:description", content: "Pick a physical SIM or an eSIM for your new line." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SimPage,
});

interface SimOption {
  value: SimChoice;
  title: string;
  description: string;
}

function SimPage() {
  const { t } = useLocalizedTranslation();
  const { tenant } = useTenant();
  const { state, patch } = useOnboarding();
  const navigate = useNavigate();
  useSyncOnboardingStep("sim");

  // The offer constrains which SIM forms are available (simTypes absent = both allowed).
  const offersQuery = useQuery({
    queryKey: ["offers", tenant],
    queryFn: () => api.listOffers(tenant),
  });
  const offer = offersQuery.data?.find((o) => o.offerId === state.selectedOfferId);
  const allowed: readonly SimChoice[] = offer?.simTypes ?? ["physical", "esim"];

  const allOptions: SimOption[] = [
    {
      value: "esim",
      title: t("onboarding.sim.esim.title", "eSIM"),
      description: t(
        "onboarding.sim.esim.description",
        "Install it on this device now — nothing to ship, nothing to wait for.",
      ),
    },
    {
      value: "physical",
      title: t("onboarding.sim.physical.title", "Physical SIM"),
      description: t(
        "onboarding.sim.physical.description",
        "We mail you a SIM card. Best if your phone doesn't support eSIM.",
      ),
    },
  ];
  const options = allOptions.filter((o) => allowed.includes(o.value));

  function choose(value: string) {
    patch({ simType: value as SimChoice });
  }

  function onContinue() {
    // The chosen form decides whether /delivery is in the flow; the next working step is /addons
    // either way (delivery comes later, only for physical).
    void navigate({ to: "/onboarding/addons" });
  }

  return (
    <WizardPage
      step="sim"
      title={t("onboarding.sim.title", "Physical SIM or eSIM?")}
      subtitle={t(
        "onboarding.sim.subtitle",
        "An eSIM activates on this device. A physical SIM is mailed to you.",
      )}
    >
      {offersQuery.isPending ? (
        <div className="grid gap-2" aria-hidden="true">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : offersQuery.isError ? (
        <SeamErrorNotice
          error={
            offersQuery.error instanceof SeamFailure
              ? offersQuery.error
              : new SeamFailure({
                  code: "catalog.listOffers",
                  category: "unavailable",
                  retryable: true,
                })
          }
          onRetry={() => void offersQuery.refetch()}
        />
      ) : (
        <>
          <RadioGroup
            value={state.simType ?? null}
            onValueChange={choose}
            aria-label={t("onboarding.sim.title", "Physical SIM or eSIM?")}
          >
            {options.map((opt) => {
              const radioId = `sim-${opt.value}`;
              const descId = `${radioId}-desc`;
              return (
                <div
                  key={opt.value}
                  className="rounded-card border border-hairline bg-surface transition-colors hover:border-accent-ink has-[[data-state=checked]]:border-2 has-[[data-state=checked]]:border-accent-ink"
                >
                  <label htmlFor={radioId} className="flex items-start gap-3 p-4 cursor-pointer">
                    <RadioGroupItem
                      id={radioId}
                      value={opt.value}
                      aria-describedby={descId}
                      className="mt-1"
                    />
                    <span id={descId} className="min-w-0 flex-1">
                      <span className="type-body font-medium text-text-primary">{opt.title}</span>
                      <span className="mt-0.5 block type-caption text-text-secondary">
                        {opt.description}
                      </span>
                    </span>
                  </label>
                </div>
              );
            })}
          </RadioGroup>

          <p className="mt-3 type-caption text-text-secondary">
            {t(
              "onboarding.sim.esimHelp",
              "Not sure your phone supports eSIM? Most phones from 2019 onwards do — look for “eSIM” or “Add mobile plan” in your phone’s settings.",
            )}
          </p>

          <WizardNav
            onBack={() => navigate({ to: "/onboarding/plan" })}
            onContinue={onContinue}
            continueDisabled={state.simType == null}
            disabledHint={t("onboarding.sim.disabledHint", "Choose a SIM type to continue.")}
          />
        </>
      )}
    </WizardPage>
  );
}
