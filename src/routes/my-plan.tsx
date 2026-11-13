import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useTenant } from "@/hooks/use-tenant";
import { useCurrentCustomerId } from "@/lib/current-customer";
import type { Locale } from "@/lib/tenant-rules";
import type { Customer360 } from "@/services/model";
import { PageShell } from "@/components/page-shell";
import { SeamErrorNotice } from "@/components/onboarding/seam-error-notice";
import { Skeleton } from "@/components/ui/skeleton";
import { AllowanceRow } from "@/components/my-plan/allowance-row";
import { CopyNumberButton } from "@/components/line/copy-number-button";
import { LineStatusBadge } from "@/components/line/line-status-badge";
import { StatusDot } from "@/components/status/status-dot";
import { api, SeamFailure } from "@/services/api";
import { formatPrice } from "@/lib/format";
import { formatRelativeDays, formatShortDate } from "@/lib/format-date";
import {
  activeAddOns,
  lineSimType,
  lineStatus,
  primaryPlan,
  renewalWhen,
} from "@/services/customer360-rules";

export const Route = createFileRoute("/my-plan")({
  head: () => ({
    meta: [
      { title: "My plan — whitelabel" },
      { name: "description", content: "What your plan includes and when it renews." },
      { property: "og:title", content: "My plan — whitelabel" },
      { property: "og:description", content: "What your plan includes and when it renews." },
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
      subtitle={t("pages.myPlan.subtitle", "What your plan includes and when it renews.")}
      flush
    >
      {query.isPending ? (
        <>
          <p className="sr-only" role="status">
            {t("pages.myPlan.loading", "Loading your plan…")}
          </p>
          <div className="grid gap-3" aria-hidden="true">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
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
        <PlanDetail data={query.data} locale={locale} />
      )}
    </PageShell>
  );
}

function PlanDetail({ data, locale }: { data: Customer360; locale: Locale }) {
  const { t } = useLocalizedTranslation();
  const plan = primaryPlan(data);
  const when = renewalWhen(data);
  const addOns = activeAddOns(data);
  const status = lineStatus(data);

  return (
    <div className="grid gap-6">
      {/* Plan — leads the page: name, price per cycle, renewal, status (once). */}
      <section className="rounded-card border border-hairline bg-surface p-4">
        {plan ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <h2 className="type-heading text-text-primary">{plan.offer?.name ?? plan.name}</h2>
              <LineStatusBadge status={status} />
            </div>
            {plan.offer ? (
              <p className="mt-1 type-body text-text-secondary tabular-nums">
                {plan.offer.validityDays
                  ? t("pages.myPlan.pricePerCycle", "{{price}} every {{days}} days", {
                      price: formatPrice(plan.offer.priceMinor, plan.offer.currency, locale),
                      days: String(plan.offer.validityDays),
                    })
                  : formatPrice(plan.offer.priceMinor, plan.offer.currency, locale)}
              </p>
            ) : null}
            {when ? (
              <p className="mt-1 type-body-sm text-text-primary">
                {when.relative
                  ? t("pages.myPlan.renewsInOn", "Renews {{when}} · {{date}}", {
                      when: formatRelativeDays(when.days, locale),
                      date: formatShortDate(when.iso, locale),
                    })
                  : t("pages.myPlan.renewsOn", "Renews on {{date}}", {
                      date: formatShortDate(when.iso, locale),
                    })}
              </p>
            ) : null}
            {plan.offer?.autoRenew && plan.status !== "pending" ? (
              <p className="mt-0.5 type-body-sm text-text-secondary">
                {t("pages.myPlan.autoRenew", "Renews automatically from your balance.")}
              </p>
            ) : null}
          </>
        ) : (
          <p className="type-body text-text-secondary">
            {t("pages.myPlan.noPlan", "You don't have an active plan yet.")}
          </p>
        )}
      </section>

      {/* Allowances — every bucket (data, calls, texts, EU roaming): text first, bar as support. */}
      <section aria-labelledby="my-plan-allowances">
        <h2 id="my-plan-allowances" className="type-caption text-text-secondary">
          {t("pages.myPlan.allowancesLabel", "Allowances")}
        </h2>
        {data.usage.length === 0 ? (
          <p className="mt-1 type-body text-text-secondary">
            {t("pages.myPlan.noAllowances", "No allowances on your line yet.")}
          </p>
        ) : (
          <>
            {when ? (
              <p className="mt-1 type-body-sm text-text-secondary">
                {t("pages.myPlan.refillsOn", "Refill on {{date}}", {
                  date: formatShortDate(when.iso, locale),
                })}
              </p>
            ) : null}
            {/* One grouped card with hairline dividers — calmer than a box per allowance. */}
            <ul className="mt-2 divide-y divide-hairline rounded-card border border-hairline bg-surface">
              {data.usage.map((b) => (
                <AllowanceRow key={b.bucketId} bucket={b} />
              ))}
            </ul>
          </>
        )}
        {data.usage.some((b) => b.type === "roaming") ? (
          <p className="mt-2 type-caption text-text-secondary">
            {t("pages.myPlan.fairUse", "EU roaming under fair use policy.")}
          </p>
        ) : null}
      </section>

      {/* Active add-ons — empty state invites a look at the catalogue. */}
      <section aria-labelledby="my-plan-addons">
        <h2 id="my-plan-addons" className="type-caption text-text-secondary">
          {t("pages.myPlan.addOnsLabel", "Active add-ons")}
        </h2>
        {addOns.length === 0 ? (
          <div className="mt-2 flex items-center justify-between gap-3 rounded-card border border-hairline bg-surface p-3">
            <p className="type-body-sm text-text-secondary">
              {t("pages.myPlan.noAddOns", "No active add-ons.")}
            </p>
            <Link
              to="/add-ons"
              className="focus-ring type-body-sm-strong shrink-0 rounded-pill text-accent-ink"
            >
              {t("pages.myPlan.seeAddOns", "See add-ons")}
            </Link>
          </div>
        ) : (
          <ul className="mt-2 grid gap-2">
            {addOns.map((p) => (
              <li
                key={p.productId}
                className="flex items-center justify-between gap-2 rounded-card border border-hairline bg-surface p-3"
              >
                <span className="type-body text-text-primary">{p.offer?.name ?? p.name}</span>
                {p.status === "pending" ? (
                  <span className="flex items-center gap-1.5 type-caption text-text-primary">
                    <StatusDot tone="warning" />
                    {t("pages.myPlan.statusPending", "Pending")}
                  </span>
                ) : p.offer ? (
                  <span className="type-body-sm text-text-secondary tabular-nums">
                    {formatPrice(p.offer.priceMinor, p.offer.currency, locale)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Your line — number (tap to copy) and SIM form. */}
      <section aria-labelledby="my-plan-line">
        <h2 id="my-plan-line" className="type-caption text-text-secondary">
          {t("pages.myPlan.lineLabel", "Your line")}
        </h2>
        <div className="mt-2 grid gap-1 rounded-card border border-hairline bg-surface px-3 py-1">
          {data.party.msisdn ? <CopyNumberButton msisdn={data.party.msisdn} /> : null}
          {lineSimType(data) ? (
            <p className="pb-2 type-body-sm text-text-secondary">
              {lineSimType(data) === "esim"
                ? t("pages.myPlan.simType.esim", "eSIM")
                : t("pages.myPlan.simType.physical", "Physical SIM")}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
