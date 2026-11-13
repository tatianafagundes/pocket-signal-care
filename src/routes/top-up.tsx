import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useTenant } from "@/hooks/use-tenant";
import { useCurrentCustomerId } from "@/lib/current-customer";
import type { Locale } from "@/lib/tenant-rules";
import type { Customer360 } from "@/services/model";
import { PageShell } from "@/components/page-shell";
import { SeamErrorNotice } from "@/components/onboarding/seam-error-notice";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { api, asSeamFailure } from "@/services/api";
import { queryKeys } from "@/lib/query-keys";
import { projectedBalanceAfterTopUp } from "@/services/customer360-rules";
import { formatMsisdn, formatPrice } from "@/lib/format";
import { formatShortDate } from "@/lib/format-date";

export const Route = createFileRoute("/top-up")({
  head: () => ({
    meta: [
      { title: "Top up — whitelabel" },
      { name: "description", content: "Top up in your whitelabel prepaid mobile self-care app." },
      { property: "og:title", content: "Top up — whitelabel" },
      {
        property: "og:description",
        content: "Top up in your whitelabel prepaid mobile self-care app.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

/** The fixed top-up denominations (minor units, EUR), as in the Figma amount screen. */
const TOPUP_AMOUNTS_MINOR = [1000, 2000, 3000, 5000] as const;
/** Default selection — €20, the Figma default. */
const DEFAULT_AMOUNT_MINOR = 2000;

/** Which step of the top-up task is on screen. A reload does not resume a half-finished payment. */
type Phase = "amount" | "handoff" | "result";

function Page() {
  const { t } = useLocalizedTranslation();
  const { tenant, locale } = useTenant();
  const customerId = useCurrentCustomerId();

  const query = useQuery({
    queryKey: queryKeys.customer360(tenant, customerId),
    queryFn: () => api.getCustomer360(customerId, tenant),
  });

  // The top-up task is a small state machine in one route (not sub-routes): a transient flow that
  // must not be deep-linked or resumed across reloads. Amount is the entry phase.
  const [phase, setPhase] = useState<Phase>("amount");
  const [amountMinor, setAmountMinor] = useState<number>(DEFAULT_AMOUNT_MINOR);

  return (
    <PageShell title={t("pages.topUp.title", "Top up")} flush>
      {query.isPending ? (
        <>
          <p className="sr-only" role="status">
            {t("pages.topUp.loading", "Loading your balance…")}
          </p>
          <div className="grid gap-3" aria-hidden="true">
            <Skeleton className="h-20 w-full rounded-card" />
            <Skeleton className="h-64 w-full rounded-card" />
          </div>
        </>
      ) : query.isError ? (
        <SeamErrorNotice
          error={asSeamFailure(query.error, "cpr.getCustomer360")}
          onRetry={() => void query.refetch()}
        />
      ) : phase === "amount" ? (
        <AmountStep
          data={query.data}
          locale={locale}
          amountMinor={amountMinor}
          onAmountChange={setAmountMinor}
          onPay={() => setPhase("handoff")}
        />
      ) : (
        // Handoff + result phases land in the next increments (4a/4b).
        <p className="type-body text-text-secondary">…</p>
      )}
    </PageShell>
  );
}

interface AmountStepProps {
  data: Customer360;
  locale: Locale;
  amountMinor: number;
  onAmountChange: (amountMinor: number) => void;
  onPay: () => void;
}

/** P2 "How much?" — pick a denomination, see the honest projected balance, pay. */
function AmountStep({ data, locale, amountMinor, onAmountChange, onPay }: AmountStepProps) {
  const { t } = useLocalizedTranslation();
  const balance = data.balance;
  const msisdn = data.party.msisdn;
  // The projected balance uses the SAME amount + validity rule the charging seam applies on credit,
  // so this preview is honest: what you see here is what the top-up produces.
  const projected = projectedBalanceAfterTopUp(data, amountMinor);

  return (
    <div className="grid gap-5">
      {/* Context: current balance + where the top-up lands. */}
      <section className="rounded-card bg-surface-tint p-4">
        <p className="type-body-sm-strong text-text-primary">
          {balance
            ? t("pages.topUp.context.balance", "Balance {{amount}} · valid until {{date}}", {
                amount: formatPrice(balance.amountMinor, balance.currency, locale),
                date: balance.validUntil ? formatShortDate(balance.validUntil, locale) : "—",
              })
            : t("pages.topUp.context.balance", "Balance {{amount}} · valid until {{date}}", {
                amount: formatPrice(0, "EUR", locale),
                date: "—",
              })}
        </p>
        {msisdn ? (
          <p className="mt-1 type-body-sm text-text-secondary">
            {t("pages.topUp.context.goesTo", "Top-up goes to {{msisdn}}", {
              msisdn: formatMsisdn(msisdn),
            })}
          </p>
        ) : null}
      </section>

      {/* How much? — the denominations as option-rows with a radio. */}
      <section aria-labelledby="top-up-amount">
        <h2 id="top-up-amount" className="type-caption text-text-secondary">
          {t("pages.topUp.howMuch", "How much?")}
        </h2>
        <RadioGroup
          className="mt-2 gap-0 overflow-hidden rounded-card border border-hairline bg-surface"
          value={String(amountMinor)}
          onValueChange={(v) => onAmountChange(Number(v))}
          aria-label={t("pages.topUp.howMuch", "How much?")}
        >
          {TOPUP_AMOUNTS_MINOR.map((amt, i) => {
            const id = `topup-amount-${amt}`;
            const selected = amt === amountMinor;
            // Each option previews the validity THAT amount would produce (all extend by the rule).
            const optionProjected = projectedBalanceAfterTopUp(data, amt);
            return (
              <label
                key={amt}
                htmlFor={id}
                className={`flex min-h-[56px] cursor-pointer items-center gap-3 p-3 ${
                  i > 0 ? "border-t border-hairline" : ""
                } ${selected ? "bg-accent-tint" : ""}`}
              >
                <RadioGroupItem value={String(amt)} id={id} />
                <span className="min-w-0 flex-1">
                  <span className="block type-body-sm-strong text-text-primary">
                    {formatPrice(amt, "EUR", locale)}
                  </span>
                  <span className="mt-0.5 block type-caption text-text-secondary">
                    {t("pages.topUp.optionValidUntil", "Valid until {{date}}", {
                      date: optionProjected.validUntil
                        ? formatShortDate(optionProjected.validUntil, locale)
                        : "—",
                    })}
                  </span>
                </span>
              </label>
            );
          })}
        </RadioGroup>
      </section>

      {/* Payment method — a demo card, shown read-only (no saved-card model; documented artifact). */}
      <section aria-labelledby="top-up-method">
        <h2 id="top-up-method" className="sr-only">
          {t("pages.topUp.method.label", "Mastercard •••• 7310")}
        </h2>
        <div className="flex items-center gap-3 rounded-card border border-hairline bg-surface p-3">
          <span className="min-w-0 flex-1">
            <span className="block type-body-sm-strong text-text-primary">
              {t("pages.topUp.method.label", "Mastercard •••• 7310")}
            </span>
            <span className="mt-0.5 block type-caption text-text-secondary">
              {t("pages.topUp.method.expires", "Expires 03/29")}
            </span>
          </span>
        </div>
      </section>

      {/* Summary: the honest projected balance + the pay action. */}
      <section className="rounded-card border border-hairline bg-surface p-4">
        <p className="type-body-sm-strong text-text-primary">
          {t("pages.topUp.summary.newBalance", "New balance {{amount}}", {
            amount: formatPrice(projected.amountMinor, projected.currency, locale),
          })}
        </p>
        <p className="mt-1 type-body-sm text-text-secondary">
          {t("pages.topUp.summary.validUntil", "Valid until {{date}}", {
            date: projected.validUntil ? formatShortDate(projected.validUntil, locale) : "—",
          })}
        </p>
        <Button className="mt-3 w-full" onClick={onPay}>
          {t("pages.topUp.pay", "Pay {{amount}}", {
            amount: formatPrice(amountMinor, "EUR", locale),
          })}
        </Button>
      </section>
    </div>
  );
}
