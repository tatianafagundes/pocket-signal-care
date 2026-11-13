import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useTenant } from "@/hooks/use-tenant";
import { useCurrentCustomerId } from "@/lib/current-customer";
import { PageShell } from "@/components/page-shell";
import { SeamErrorNotice } from "@/components/onboarding/seam-error-notice";
import { Skeleton } from "@/components/ui/skeleton";
import { DemoStateSwitcher } from "@/components/demo/demo-state-switcher";
import { RecentActivity } from "@/components/account/recent-activity";
import { api, SeamFailure } from "@/services/api";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Account — whitelabel" },
      { name: "description", content: "Account in your whitelabel prepaid mobile self-care app." },
      { property: "og:title", content: "Account — whitelabel" },
      {
        property: "og:description",
        content: "Account in your whitelabel prepaid mobile self-care app.",
      },
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
    <PageShell title={t("pages.account.title", "My account")} flush>
      <div className="grid gap-5">
        {query.isPending ? (
          <>
            <p className="sr-only" role="status">
              {t("pages.account.loading", "Loading your account…")}
            </p>
            <Skeleton className="h-40 w-full rounded-card" aria-hidden="true" />
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
          <RecentActivity activity={query.data.activity} locale={locale} />
        )}

        {/* Dev-only demo tool; renders nothing in a real build or when signed out. */}
        <DemoStateSwitcher />
      </div>
    </PageShell>
  );
}
