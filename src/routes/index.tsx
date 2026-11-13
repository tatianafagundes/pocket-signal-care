import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

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
import { SuspendedNotice } from "@/components/home/suspended-notice";
import { AddDataCard } from "@/components/home/add-data-card";
import { UsageSummaryCard } from "@/components/home/usage-summary-card";
import { PlanSummaryCard } from "@/components/home/plan-summary-card";
import { api, SeamFailure } from "@/services/api";
import {
  balanceState,
  homeDataPrompt,
  homeNotice,
  lineSimType,
  lineStatus,
  primaryDataBucket,
  primaryPlan,
  renewalCovered,
  renewalShortfall,
  renewalWhen,
} from "@/services/customer360-rules";
import { formatQuantity } from "@/lib/usage-format";

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

/** The logged-in Home — line, balance, data allowance and plan summary (Figma P1). */
function HomeDashboard() {
  const { t } = useLocalizedTranslation();
  const { tenant, locale } = useTenant();
  const { session } = useSession();
  const customerId = useCurrentCustomerId();

  const query = useQuery({
    queryKey: ["customer360", tenant, customerId],
    queryFn: () => api.getCustomer360(customerId),
  });

  // The session already knows the name, so the greeting never flashes "Hi there" while loading.
  const name = query.data?.party.givenName ?? session?.givenName ?? null;
  const greeting = name
    ? t("pages.home.greeting", "Hi {{name}}", { name })
    : t("pages.home.greetingPlain", "Hi there");

  const data = query.data;
  const when = data ? renewalWhen(data) : null;
  const notice = data ? homeNotice(data) : null;
  const dataPrompt = data ? homeDataPrompt(data) : null;
  const dataBucket = data ? primaryDataBucket(data) : null;

  return (
    <PageShell
      title={greeting}
      flush
      lead={
        data ? (
          <LineHeader
            msisdn={data.party.msisdn}
            simType={lineSimType(data)}
            status={lineStatus(data)}
          />
        ) : query.isPending ? (
          <div className="flex min-h-11 items-center justify-between gap-2" aria-hidden="true">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-7 w-28 rounded-pill" />
          </div>
        ) : null
      }
    >
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
          {notice === "suspended" ? <SuspendedNotice /> : null}
          {notice === "renewal" ? (
            <RenewalNotice
              shortfallMinor={renewalShortfall(query.data)}
              planName={primaryPlan(query.data)?.offer?.name ?? primaryPlan(query.data)?.name ?? ""}
              renewsAt={when?.iso ?? null}
              locale={locale}
            />
          ) : null}

          <BalanceCard
            balance={query.data.balance}
            state={balanceState(query.data)}
            locale={locale}
            coversRenewal={renewalCovered(query.data) ? when : null}
          />

          {/* Data + Plan — the usage axis summary and the plan summary, side by side. */}
          <div className="grid grid-cols-2 gap-3">
            <UsageSummaryCard bucket={dataBucket} />
            <PlanSummaryCard plan={primaryPlan(query.data)} when={when} locale={locale} />
          </div>

          {/* Add data — only when data is low or used up; the way out sits next to the problem. */}
          {dataPrompt && dataBucket ? (
            <AddDataCard
              prompt={dataPrompt}
              remainingLabel={`${formatQuantity(dataBucket.remaining?.value ?? 0, locale)}\u00a0${t("usage.unit.gb", "GB")}`}
            />
          ) : null}
        </div>
      )}
    </PageShell>
  );
}

/** Neutral placeholders shaped like the real Home (balance, then the Data + Plan pair). */
function HomeSkeleton({ loadingLabel }: { loadingLabel: string }) {
  return (
    <>
      <p className="sr-only" role="status">
        {loadingLabel}
      </p>
      <div className="grid gap-4" aria-hidden="true">
        <Skeleton className="h-48 w-full rounded-card" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-48 w-full rounded-card" />
          <Skeleton className="h-48 w-full rounded-card" />
        </div>
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
