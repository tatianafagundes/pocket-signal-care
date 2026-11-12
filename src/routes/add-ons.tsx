import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useTenant } from "@/hooks/use-tenant";
import { PageShell } from "@/components/page-shell";
import { AddOnCard } from "@/components/add-ons/add-on-card";
import { SeamErrorNotice } from "@/components/onboarding/seam-error-notice";
import { Skeleton } from "@/components/ui/skeleton";
import { api, SeamFailure } from "@/services/api";
import { useCurrentCustomerId } from "@/lib/current-customer";
import type { Offer } from "@/services/model";
import type { QualifyResult } from "@/services/catalog-rules";

export const Route = createFileRoute("/add-ons")({
  head: () => ({
    meta: [
      { title: "Add-ons — whitelabel" },
      { name: "description", content: "Boost your plan with extra data, roaming or streaming." },
      { property: "og:title", content: "Add-ons — whitelabel" },
      {
        property: "og:description",
        content: "Boost your plan with extra data, roaming or streaming.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

interface AddOnWithQualify {
  offer: Offer;
  qualify: QualifyResult;
}

function Page() {
  const { t } = useLocalizedTranslation();
  const { tenant } = useTenant();
  const customerId = useCurrentCustomerId();

  // Fetch the add-ons, then qualify each against the current customer's balance (TMF679). One
  // query keeps the list and its qualifications consistent (no flicker of cards without a state).
  const query = useQuery<AddOnWithQualify[]>({
    queryKey: ["add-ons", tenant, customerId],
    queryFn: async () => {
      const offers = await api.listAddOns(tenant);
      return Promise.all(
        offers.map(async (offer) => ({
          offer,
          qualify: await api.qualifyOffer(offer.offerId, { tenantId: tenant, customerId }),
        })),
      );
    },
  });

  return (
    <PageShell
      title={t("pages.addOns.title", "Add-ons")}
      subtitle={t(
        "pages.addOns.subtitle",
        "Boost your plan with extra data, roaming or streaming.",
      )}
    >
      {query.isPending ? (
        <div className="grid gap-2" aria-hidden="true">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : query.isError ? (
        <SeamErrorNotice
          error={
            query.error instanceof SeamFailure
              ? query.error
              : new SeamFailure({
                  code: "catalog.listAddOns",
                  category: "unavailable",
                  retryable: true,
                })
          }
          onRetry={() => void query.refetch()}
        />
      ) : query.data.length === 0 ? (
        <p className="type-body text-text-secondary">
          {t("pages.addOns.empty", "No add-ons are available right now.")}
        </p>
      ) : (
        <ul className="grid gap-3" aria-label={t("pages.addOns.listLabel", "Available add-ons")}>
          {query.data.map(({ offer, qualify }) => (
            <li key={offer.offerId}>
              <AddOnCard
                offer={offer}
                qualify={qualify}
                buyNote={t("pages.addOns.buyNote", "Buying add-ons is coming soon.")}
              />
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
