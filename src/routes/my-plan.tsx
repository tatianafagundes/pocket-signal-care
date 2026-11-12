import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useTenant } from "@/hooks/use-tenant";
import { useCurrentCustomerId } from "@/lib/current-customer";
import { PageShell } from "@/components/page-shell";
import { SeamErrorNotice } from "@/components/onboarding/seam-error-notice";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { api, SeamFailure } from "@/services/api";
import { formatPrice } from "@/lib/format";

export const Route = createFileRoute("/my-plan")({
  head: () => ({
    meta: [
      { title: "My plan — whitelabel" },
      { name: "description", content: "Your plan, balance and products." },
      { property: "og:title", content: "My plan — whitelabel" },
      { property: "og:description", content: "Your plan, balance and products." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const { t } = useLocalizedTranslation();
  const { tenant, locale } = useTenant();
  const customerId = useCurrentCustomerId();

  const query = useQuery({
    queryKey: ["customer360", tenant, customerId],
    queryFn: () => api.getCustomer360(customerId),
  });

  return (
    <PageShell
      title={t("pages.myPlan.title", "My plan")}
      subtitle={t("pages.myPlan.subtitle", "Your plan, balance and products.")}
    >
      {query.isPending ? (
        <>
          <p className="sr-only" role="status">
            {t("pages.myPlan.loading", "Loading your plan…")}
          </p>
          <div className="grid gap-3" aria-hidden="true">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </>
      ) : query.isError ? (
        <SeamErrorNotice
          error={
            query.error instanceof SeamFailure
              ? query.error
              : new SeamFailure({
                  code: "cpr.getCustomer360",
                  category: "unavailable",
                  retryable: true,
                })
          }
          onRetry={() => void query.refetch()}
        />
      ) : (
        <div className="grid gap-5">
          {/* Balance — null for a brand-new prepaid customer; show the top-up prompt, never €0.00. */}
          <section>
            <h2 className="type-caption text-text-secondary">
              {t("pages.myPlan.balanceLabel", "Balance")}
            </h2>
            {query.data.balance ? (
              <p className="type-title text-text-primary tabular-nums">
                {formatPrice(query.data.balance.amountMinor, query.data.balance.currency, locale)}
              </p>
            ) : (
              <p className="mt-1 type-body text-text-secondary">
                {t("pages.myPlan.balanceEmpty", "No balance yet — make your first top up.")}
              </p>
            )}
          </section>

          {/* Installed base — the plan + SIM + any add-ons provisioned on the customer. */}
          <section>
            <h2 className="type-caption text-text-secondary">
              {t("pages.myPlan.productsLabel", "Your products")}
            </h2>
            {query.data.installedBase.length === 0 ? (
              <p className="mt-1 type-body text-text-secondary">
                {t("pages.myPlan.noProducts", "No products on your plan yet.")}
              </p>
            ) : (
              <ul className="mt-2 grid gap-2">
                {query.data.installedBase.map((product) => (
                  <li
                    key={product.productId}
                    className="flex items-center justify-between gap-2 rounded-card border border-hairline bg-surface p-3"
                  >
                    <span className="min-w-0">
                      <span className="type-body text-text-primary">{product.name}</span>
                      {/* SIM form (Fase 7.5): the proof the /sim choice had an effect. */}
                      {product.kind === "sim" && product.simType ? (
                        <span className="mt-0.5 block type-caption text-text-secondary">
                          {product.simType === "esim"
                            ? t("pages.myPlan.simType.esim", "eSIM")
                            : t("pages.myPlan.simType.physical", "Physical SIM")}
                        </span>
                      ) : null}
                    </span>
                    <span className="type-caption text-text-secondary">
                      {product.status === "active"
                        ? t("pages.myPlan.statusActive", "Active")
                        : t("pages.myPlan.statusPending", "Pending")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Button asChild variant="outline" className="min-h-11 w-full">
            <Link to="/top-up">{t("nav.topUp", "Top up")}</Link>
          </Button>
        </div>
      )}
    </PageShell>
  );
}
