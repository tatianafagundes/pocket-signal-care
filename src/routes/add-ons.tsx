import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useTenant } from "@/hooks/use-tenant";
import { PageShell } from "@/components/page-shell";
import { AddOnCard, type BuyStatus } from "@/components/add-ons/add-on-card";
import { SeamErrorNotice } from "@/components/onboarding/seam-error-notice";
import { Skeleton } from "@/components/ui/skeleton";
import { api, SeamFailure } from "@/services/api";
import { queryKeys } from "@/lib/query-keys";
import { useCurrentCustomerId } from "@/lib/current-customer";
import { purchaseAddOn } from "@/lib/addon-purchase";
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
  const queryClient = useQueryClient();

  // Fetch the add-ons, then qualify each against the current customer's balance (TMF679). One
  // query keeps the list and its qualifications consistent (no flicker of cards without a state).
  const query = useQuery<AddOnWithQualify[]>({
    queryKey: queryKeys.addOns(tenant, customerId),
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

  // Buy = createCart → addItem → submitOrder on the current customer (see lib/addon-purchase).
  // The offerId being bought drives the per-card busy/error state; "success" persists so the card
  // can show the "Added" confirmation until the list re-qualifies.
  const [activeOfferId, setActiveOfferId] = useState<string | null>(null);
  const [boughtOfferId, setBoughtOfferId] = useState<string | null>(null);
  const buy = useMutation({
    mutationFn: (offer: Offer) => purchaseAddOn(customerId, offer),
    onSuccess: (_orderId, offer) => {
      setBoughtOfferId(offer.offerId);
      // Refresh the customer's plan so the add-on shows in My plan, and the usage buckets so the
      // granted allowance shows, and re-qualify the list against the (now-charged) balance.
      void queryClient.invalidateQueries({ queryKey: queryKeys.customer360(tenant, customerId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.addOns(tenant, customerId) });
    },
  });

  function statusFor(offerId: string): BuyStatus {
    if (buy.isPending && activeOfferId === offerId) return "busy";
    if (buy.isError && activeOfferId === offerId) return "error";
    if (boughtOfferId === offerId) return "success";
    return "idle";
  }

  function handleBuy(offerId: string) {
    const offer = query.data?.find((a) => a.offer.offerId === offerId)?.offer;
    if (offer === undefined) return;
    setActiveOfferId(offerId);
    buy.mutate(offer);
  }

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
                onBuy={handleBuy}
                buyStatus={statusFor(offer.offerId)}
                anyBusy={buy.isPending}
              />
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
