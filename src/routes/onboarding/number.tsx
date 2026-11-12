import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";

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
  const { tenant } = useTenant();
  const { state, patch } = useOnboarding();
  const navigate = useNavigate();
  useSyncOnboardingStep("number");

  const [selected, setSelected] = useState<string | null>(state.reservedMsisdn);
  const [reserveError, setReserveError] = useState<SeamFailure | null>(null);

  const numbersQuery = useQuery({
    queryKey: ["msisdns", tenant],
    queryFn: () => api.listAvailableMsisdn(tenant),
  });

  const reserve = useMutation({
    mutationFn: (msisdn: string) => api.reserveMsisdn({ tenantId: tenant, msisdn }),
    onSuccess: (_data, msisdn) => {
      setReserveError(null);
      patch({ reservedMsisdn: msisdn });
      void navigate({ to: "/onboarding/review" });
    },
    onError: (err) => {
      if (err instanceof SeamFailure) {
        setReserveError(err);
        // On a concurrency conflict the number is gone — refresh the pool so the user re-picks.
        if (err.code === "resource.msisdn.taken") {
          setSelected(null);
          void numbersQuery.refetch();
        }
      } else {
        throw err;
      }
    },
  });

  return (
    <WizardPage
      step="number"
      title={t("onboarding.number.title", "Pick your number")}
      subtitle={t(
        "onboarding.number.subtitle",
        "Choose a new mobile number and we'll hold it for you.",
      )}
    >
      {numbersQuery.isPending ? (
        <div className="grid gap-2" aria-hidden="true">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : numbersQuery.isError ? (
        <SeamErrorNotice
          error={
            numbersQuery.error instanceof SeamFailure
              ? numbersQuery.error
              : new SeamFailure({
                  code: "resource.listAvailableMsisdn",
                  category: "unavailable",
                  retryable: true,
                })
          }
          onRetry={() => void numbersQuery.refetch()}
        />
      ) : numbersQuery.data.length === 0 ? (
        <p className="type-body text-text-secondary">
          {t("onboarding.number.empty", "No numbers are available right now.")}
        </p>
      ) : (
        <>
          {reserveError ? <SeamErrorNotice error={reserveError} className="mb-4" /> : null}

          <RadioGroup
            value={selected ?? null}
            onValueChange={setSelected}
            aria-label={t("onboarding.number.listLabel", "Available numbers")}
          >
            {numbersQuery.data.map((m) => {
              const id = `msisdn-${m.msisdn}`;
              return (
                <label
                  key={m.msisdn}
                  htmlFor={id}
                  className="flex items-center gap-3 rounded-card border border-hairline bg-surface p-4 type-body text-text-primary hover:border-accent-ink cursor-pointer"
                >
                  <RadioGroupItem id={id} value={m.msisdn} />
                  <span className="font-medium tabular-nums">{m.msisdn}</span>
                </label>
              );
            })}
          </RadioGroup>

          <WizardNav
            onBack={() => navigate({ to: "/onboarding/details" })}
            onContinue={() => selected && reserve.mutate(selected)}
            continueLabel={t("onboarding.number.reserve", "Reserve this number")}
            continueDisabled={selected == null}
            busy={reserve.isPending}
          />
        </>
      )}
    </WizardPage>
  );
}
