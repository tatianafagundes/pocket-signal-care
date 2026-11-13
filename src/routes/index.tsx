import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PackagePlus } from "lucide-react";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useTenant } from "@/hooks/use-tenant";
import { useSession } from "@/hooks/use-session";
import { useCurrentCustomerId } from "@/lib/current-customer";
import { PageShell } from "@/components/page-shell";
import { SeamErrorNotice } from "@/components/onboarding/seam-error-notice";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { BalanceCard } from "@/components/home/balance-card";
import { LineHeader } from "@/components/home/line-header";
import { RenewalNotice } from "@/components/home/renewal-notice";
import { UsageSummaryCard } from "@/components/home/usage-summary-card";
import { PlanSummaryCard } from "@/components/home/plan-summary-card";
import { api, SeamFailure } from "@/services/api";
import {
  balanceState,
  lineSimType,
  lineStatus,
  planRenewsAt,
  primaryDataBucket,
  primaryPlan,
  renewalShortfall,
} from "@/services/customer360-rules";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Home — whitelabel" },
      { name: "description", content: "Home in your whitelabel prepaid mobile self-care app." },
      { property: "og:title", content: "Home — whitelabel" },
      {
        property: "og:description",
        content: "Home in your whitelabel prepaid mobile self-care app.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const { session } = useSession();
  // Signed in → the logged-in Home dashboard. Not signed in → the prospect onboarding entry.
  // (useSession, not useCurrentCustomerId: the latter always resolves to the demo customer.)
  return session ? <HomeDashboard /> : <OnboardingEntry />;
}

/** The logged-in Home — balance, data allowance and plan summary (Figma P1). */
function HomeDashboard() {
  const { t } = useLocalizedTranslation();
  const { tenant, locale } = useTenant();
  const customerId = useCurrentCustomerId();

  const query = useQuery({
    queryKey: ["customer360", tenant, customerId],
    queryFn: () => api.getCustomer360(customerId),
  });

  const greeting = query.data
    ? t("pages.home.greeting", "Hi {{name}}", { name: query.data.party.givenName })
    : t("pages.home.greetingPlain", "Hi there");

  return (
    <PageShell title={greeting} flush>
      {query.isPending ? (
        <HomeSkeleton loadingLabel={t("pages.home.loading", "Loading your home…")} />
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
        <div className="grid gap-4">
          <LineHeader
            msisdn={query.data.party.msisdn}
            simType={lineSimType(query.data)}
            status={lineStatus(query.data)}
          />

          {renewalShortfall(query.data) > 0 ? (
            <RenewalNotice
              shortfallMinor={renewalShortfall(query.data)}
              planName={primaryPlan(query.data)?.offer?.name ?? primaryPlan(query.data)?.name ?? ""}
              renewsAt={planRenewsAt(query.data)}
              locale={locale}
            />
          ) : null}

          <BalanceCard
            balance={query.data.balance}
            state={balanceState(query.data)}
            locale={locale}
          />

          {/* Data + Plan — the usage axis summary and the plan summary, side by side. */}
          <div className="grid grid-cols-2 gap-3">
            <UsageSummaryCard bucket={primaryDataBucket(query.data)} />
            <PlanSummaryCard
              plan={primaryPlan(query.data)}
              renewsAt={planRenewsAt(query.data)}
              locale={locale}
            />
          </div>

          {/* Add-ons entry. */}
          <Link
            to="/add-ons"
            className="focus-ring flex items-center gap-3 rounded-card border border-hairline bg-surface p-4"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-accent-tint">
              <PackagePlus className="size-5 text-accent-ink" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block type-body-strong text-text-primary">
                {t("nav.addOns", "Add-ons")}
              </span>
              <span className="block type-body-sm text-text-secondary">
                {t(
                  "pages.home.addOns.subtitle",
                  "Extra data, roaming or calls — paid from your balance.",
                )}
              </span>
            </span>
          </Link>
        </div>
      )}
    </PageShell>
  );
}

function HomeSkeleton({ loadingLabel }: { loadingLabel: string }) {
  return (
    <>
      <p className="sr-only" role="status">
        {loadingLabel}
      </p>
      <div className="grid gap-4" aria-hidden="true">
        <Skeleton className="h-28 w-full rounded-card" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-44 w-full rounded-card" />
          <Skeleton className="h-44 w-full rounded-card" />
        </div>
        <Skeleton className="h-16 w-full rounded-card" />
      </div>
    </>
  );
}

/** The prospect entry — unchanged from the previous Home placeholder. */
function OnboardingEntry() {
  const { t } = useLocalizedTranslation();
  const { tenantName } = useTenant();
  return (
    <PageShell
      title={t("pages.home.title", "Hi there, great to see you")}
      subtitle={t("pages.home.subtitle", "Your balance and usage summary will appear here soon.")}
    >
      <section aria-labelledby="home-onboarding-title">
        <h2 id="home-onboarding-title" className="type-body font-semibold text-text-primary">
          {t("pages.home.onboarding.title", "New to {{brand}}? Get started", {
            brand: tenantName,
          })}
        </h2>
        <p className="type-body mt-1 text-text-secondary">
          {t(
            "pages.home.onboarding.body",
            "Pick your prepaid plan, choose your number and get connected in minutes.",
          )}
        </p>
        <Button asChild className="mt-4 min-h-11 w-full">
          <Link to="/onboarding">{t("pages.home.onboarding.cta", "Start onboarding")}</Link>
        </Button>
        <p className="mt-3 text-center type-caption text-text-secondary">
          <Link to="/login" className="focus-ring rounded-control text-accent-ink">
            {t("login.haveAccount", "Already have an account? Sign in")}
          </Link>
        </p>
      </section>
    </PageShell>
  );
}
