import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Copy, PackagePlus } from "lucide-react";
import { toast } from "sonner";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useTenant } from "@/hooks/use-tenant";
import { useSession } from "@/hooks/use-session";
import { useCurrentCustomerId } from "@/lib/current-customer";
import { PageShell } from "@/components/page-shell";
import { SeamErrorNotice } from "@/components/onboarding/seam-error-notice";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { UsageSummaryCard } from "@/components/home/usage-summary-card";
import { PlanSummaryCard } from "@/components/home/plan-summary-card";
import { api, SeamFailure } from "@/services/api";
import {
  lineSimType,
  planRenewsAt,
  primaryDataBucket,
  primaryPlan,
  renewalShortfall,
} from "@/services/customer360-rules";
import { formatMsisdn, formatPrice } from "@/lib/format";


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
            active={query.data.customer.status === "active"}
          />

          {/* Renewal notice — only when the balance does not cover the next plan renewal.
              Warning tint, icon + words (never colour alone), one action with the exact amount. */}
          {renewalShortfall(query.data) > 0 ? (
            <div className="flex items-start gap-3 rounded-control bg-warning-tint px-4 py-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="type-body-sm-strong text-text-primary">
                  {planRenewsAt(query.data)
                    ? t("pages.home.renewal.titleDated", "Recarregue {{amount}} para renovar {{plan}} em {{date}}", {
                        amount: formatPrice(renewalShortfall(query.data), "EUR", locale),
                        plan: primaryPlan(query.data)?.offer?.name ?? "",
                        date: formatDate(planRenewsAt(query.data) ?? "", locale),
                      })
                    : t("pages.home.renewal.title", "Recarregue {{amount}} para renovar {{plan}}", {
                        amount: formatPrice(renewalShortfall(query.data), "EUR", locale),
                        plan: primaryPlan(query.data)?.offer?.name ?? "",
                      })}
                </p>
                <p className="mt-0.5 type-body-sm text-text-secondary">
                  {t("pages.home.renewal.body", "Seu saldo ainda não cobre a próxima renovação.")}
                </p>
              </div>
              <Link
                to="/top-up"
                className="focus-ring type-body-sm-strong shrink-0 rounded-pill text-accent-ink"
              >
                {t("pages.home.renewal.cta", "Recarregar {{amount}}", {
                  amount: formatPrice(renewalShortfall(query.data), "EUR", locale),
                })}
              </Link>
            </div>
          ) : null}

          {/* Balance card — the money axis. */}
          <section className="rounded-card border border-hairline bg-surface p-4">
            <h2 className="type-caption text-text-secondary">
              {t("pages.myPlan.balanceLabel", "Balance")}
            </h2>
            {query.data.balance ? (
              <>
                <p className="mt-1 type-display-number text-text-primary">
                  {formatPrice(query.data.balance.amountMinor, query.data.balance.currency, locale)}
                </p>
                {query.data.balance.validUntil ? (
                  <p className="mt-1 type-body-sm text-text-secondary">
                    {t("pages.home.validUntil", "Valid until {{date}}", {
                      date: formatDate(query.data.balance.validUntil, locale),
                    })}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-1 type-body-sm text-text-secondary">
                {t("pages.myPlan.balanceEmpty", "No balance yet — make your first top up.")}
              </p>
            )}
            <Button asChild className="mt-4 min-h-11 w-full">
              <Link to="/top-up">{t("nav.topUp", "Top up")}</Link>
            </Button>
          </section>

          {/* Data + Plan — the usage axis summary and the plan summary, side by side. */}
          <div className="grid grid-cols-2 gap-3">
            <UsageSummaryCard bucket={primaryDataBucket(query.data)} />
            <PlanSummaryCard plan={primaryPlan(query.data)} locale={locale} />
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

/** Line identity: formatted number (tap to copy) + status and SIM form, as words. */
function LineHeader({
  msisdn,
  simType,
  active,
}: {
  msisdn: string | undefined;
  simType: "esim" | "physical" | null | undefined;
  active: boolean;
}) {
  const { t } = useLocalizedTranslation();
  if (!msisdn) return null;
  const pretty = formatMsisdn(msisdn);
  const status = [
    active ? t("pages.home.line.active", "Ativa") : null,
    simType === "esim"
      ? t("pages.home.line.esim", "eSIM")
      : simType === "physical"
        ? t("pages.home.line.physical", "SIM")
        : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <button
        type="button"
        className="focus-ring flex min-h-11 items-center gap-2 rounded-pill type-body-strong tabular-nums text-text-primary"
        aria-label={`${t("pages.home.line.copy", "Copiar número")}: ${pretty}`}
        onClick={() => {
          void navigator.clipboard?.writeText(msisdn).then(() =>
            toast.success(t("pages.home.line.copied", "Número copiado")),
          );
        }}
      >
        {pretty}
        <Copy className="size-4 text-text-tertiary" aria-hidden="true" />
      </button>
      {status ? (
        <span className="rounded-pill bg-success-tint px-3 py-1 type-caption text-success">
          {status}
        </span>
      ) : null}
    </div>
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

/** Localized date for the balance validity (e.g. "Nov 8, 2026"). */
function formatDate(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}
