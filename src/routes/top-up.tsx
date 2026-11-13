import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Lock } from "lucide-react";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useTenant } from "@/hooks/use-tenant";
import { useCurrentCustomerId } from "@/lib/current-customer";
import type { Locale, TenantId } from "@/lib/tenant-rules";
import { tenantName } from "@/lib/tenant-rules";
import type { Balance, Customer360 } from "@/services/model";
import { PageShell } from "@/components/page-shell";
import { SeamErrorNotice } from "@/components/onboarding/seam-error-notice";
import { ResultHead, SummaryRow } from "@/components/result-summary";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { api, asSeamFailure } from "@/services/api";
import { queryKeys } from "@/lib/query-keys";
import { projectedBalanceAfterTopUp } from "@/services/customer360-rules";
import { formatMsisdn, formatPrice } from "@/lib/format";
import { formatShortDate, formatDateTime } from "@/lib/format-date";
import { tokenizeCardMock } from "@/lib/card-token";
import { runTopUp } from "@/lib/topup-payment";
import {
  loadTopUpProgress,
  saveTopUpProgress,
  clearTopUpProgress,
  emptyTopUpProgress,
} from "@/lib/topup-progress";

/** The demo payment method shown on the flow (read-only — no saved-card model; see plan doc). */
const DEMO_CARD_NUMBER = "5555 5555 5555 7310";
const DEMO_METHOD_LABEL = "Mastercard •••• 7310";

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

/** A completed top-up, snapshotted for the success receipt (survives the balance query refetch). */
interface SuccessData {
  amountMinor: number;
  balance: Balance;
  authorizationRef: string;
  paidAt: string;
}

/** A failed attempt, snapshotted for the failed result. The balance is the UNCHANGED current one. */
interface FailedData {
  amountMinor: number;
  balance: Balance | null;
}

function Page() {
  const { t } = useLocalizedTranslation();
  const { tenant, locale } = useTenant();
  const customerId = useCurrentCustomerId();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.customer360(tenant, customerId),
    queryFn: () => api.getCustomer360(customerId, tenant),
  });

  // The top-up task is a small state machine in one route (not sub-routes): a transient flow that
  // must not be deep-linked or resumed across reloads. Amount is the entry phase.
  const [phase, setPhase] = useState<Phase>("amount");
  const [amountMinor, setAmountMinor] = useState<number>(DEFAULT_AMOUNT_MINOR);
  const [paying, setPaying] = useState(false);
  const [success, setSuccess] = useState<SuccessData | null>(null);
  const [failed, setFailed] = useState<FailedData | null>(null);

  // Move focus to the step heading on each phase change, so a screen reader announces the new
  // screen (the three phases share one route, so there's no route change to announce). WCAG 2.4.3.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [phase]);

  async function pay() {
    // Anti double-submit: ignore a second trigger while a payment is in flight.
    if (paying) return;
    setPaying(true);
    try {
      // Resume any persisted progress for THIS exact top-up (same tenant+customer+amount), so a
      // reload between capture and credit doesn't re-authorize (anti double-charge).
      const start = loadTopUpProgress(tenant, customerId, amountMinor);
      const result = await runTopUp({
        customerId,
        amountMinor,
        methodToken: tokenizeCardMock(DEMO_CARD_NUMBER),
        progress: start,
        patch: (next) => saveTopUpProgress(tenant, customerId, amountMinor, next),
      });
      clearTopUpProgress();
      setFailed(null);
      setSuccess({
        amountMinor,
        balance: result.balance,
        authorizationRef: result.authorizationRef,
        paidAt: new Date().toISOString(),
      });
      // Refresh balance + activity everywhere (Home, Account, My plan).
      void queryClient.invalidateQueries({ queryKey: queryKeys.customer360(tenant, customerId) });
      setPhase("result");
    } catch {
      // P6 failed result. The payment seam never credited, so the balance is unchanged — we snapshot
      // the CURRENT balance for the honest "balance stays" line. We do NOT clear persisted progress:
      // a declined authorize left nothing to resume, but a capture-failure mid-flight can resume
      // safely from where it stopped (anti double-charge) on the next attempt.
      setSuccess(null);
      setFailed({ amountMinor, balance: query.data?.balance ?? null });
      setPhase("result");
    } finally {
      setPaying(false);
    }
  }

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
      ) : phase === "handoff" ? (
        <HandoffStep
          data={query.data}
          locale={locale}
          tenant={tenant}
          amountMinor={amountMinor}
          paying={paying}
          headingRef={headingRef}
          onContinue={() => void pay()}
          onBack={() => setPhase("amount")}
        />
      ) : failed ? (
        <FailedStep
          locale={locale}
          failed={failed}
          headingRef={headingRef}
          onTryAgain={() => {
            setFailed(null);
            setPhase("amount");
          }}
        />
      ) : success ? (
        <SuccessStep locale={locale} success={success} headingRef={headingRef} />
      ) : null}
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

interface HandoffStepProps {
  data: Customer360;
  locale: Locale;
  tenant: TenantId;
  amountMinor: number;
  paying: boolean;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onContinue: () => void;
  onBack: () => void;
}

/**
 * P3 "Leaving the app to pay" — the hosted-payment-page handoff. Honest to our simulated PSP
 * (FR-6): the real authorize→capture→credit runs behind "Continue" (see runTopUp). Read-only
 * summary of what will be paid; a demo card as the method.
 */
function HandoffStep({
  data,
  locale,
  tenant,
  amountMinor,
  paying,
  headingRef,
  onContinue,
  onBack,
}: HandoffStepProps) {
  const { t } = useLocalizedTranslation();
  const msisdn = data.party.msisdn;

  return (
    <div className="grid gap-5">
      <ResultHead
        tone="accent"
        icon={<Lock className="size-9 text-accent-ink" aria-hidden="true" />}
        title={t("pages.topUp.handoff.title", "Leaving the app to pay")}
        body={t(
          "pages.topUp.handoff.body",
          "The secure payment page opens next; your bank may ask you to confirm. When you finish, you come back here and see the result.",
        )}
        headingRef={headingRef}
      />

      <div className="overflow-hidden rounded-card border border-hairline bg-surface">
        <SummaryRow
          label={t("pages.topUp.handoff.rowAmount", "Amount")}
          value={formatPrice(amountMinor, "EUR", locale)}
        />
        <SummaryRow
          label={t("pages.topUp.handoff.rowPayWith", "Pay with")}
          value={t("pages.topUp.method.label", DEMO_METHOD_LABEL)}
          divider
        />
        {msisdn ? (
          <SummaryRow
            label={t("pages.topUp.handoff.rowFor", "Top-up for")}
            value={formatMsisdn(msisdn)}
            divider
          />
        ) : null}
      </div>

      <div className="grid gap-2">
        <Button className="w-full" onClick={onContinue} disabled={paying} aria-busy={paying}>
          {paying
            ? t("pages.topUp.handoff.paying", "Processing your payment…")
            : t("pages.topUp.handoff.continue", "Continue to payment page")}
        </Button>
        <Button variant="outline" className="w-full" onClick={onBack} disabled={paying}>
          {t("pages.topUp.handoff.back", "Back")}
        </Button>
      </div>

      <p className="type-caption text-text-secondary text-center">
        {t("pages.topUp.handoff.statement", "Shows on your statement as {{brand}}", {
          brand: tenantName(tenant),
        })}
      </p>
    </div>
  );
}

interface SuccessStepProps {
  locale: Locale;
  success: SuccessData;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}

/** P5 "Balance topped up" — the success receipt. The balance line is the honest new state. */
function SuccessStep({ locale, success, headingRef }: SuccessStepProps) {
  const { t } = useLocalizedTranslation();
  const { balance } = success;
  const validUntil = balance.validUntil ? formatShortDate(balance.validUntil, locale) : "—";

  return (
    <div className="grid gap-5">
      <ResultHead
        tone="success"
        icon={<Check className="size-9 text-success" aria-hidden="true" />}
        title={t("pages.topUp.success.title", "Balance topped up")}
        body={t(
          "pages.topUp.success.body",
          "Your new balance is {{amount}}, valid until {{date}}.",
          {
            amount: formatPrice(balance.amountMinor, balance.currency, locale),
            date: validUntil,
          },
        )}
        headingRef={headingRef}
      />

      <div className="overflow-hidden rounded-card border border-hairline bg-surface">
        <SummaryRow
          label={t("pages.topUp.success.rowReference", "Reference")}
          value={success.authorizationRef}
        />
        <SummaryRow
          label={t("pages.topUp.success.rowPaid", "Paid")}
          value={formatPrice(success.amountMinor, "EUR", locale)}
          divider
        />
        <SummaryRow
          label={t("pages.topUp.success.rowDate", "Date")}
          value={formatDateTime(success.paidAt, locale)}
          divider
        />
        <SummaryRow
          label={t("pages.topUp.success.rowMethod", "Method")}
          value={t("pages.topUp.method.label", DEMO_METHOD_LABEL)}
          divider
        />
        <SummaryRow
          label={t("pages.topUp.success.rowNewBalance", "New balance")}
          value={`${formatPrice(balance.amountMinor, balance.currency, locale)} · ${validUntil}`}
          divider
        />
      </div>

      <div className="grid gap-2">
        <Button asChild className="w-full">
          <Link to="/">{t("pages.topUp.success.backHome", "Back to Home")}</Link>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link to="/my-plan">{t("pages.topUp.success.seePlan", "See my plan")}</Link>
        </Button>
      </div>
    </div>
  );
}

interface FailedStepProps {
  locale: Locale;
  failed: FailedData;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onTryAgain: () => void;
}

/**
 * P6 "Payment didn't go through" — the failed result. Honest on two counts: nothing was charged
 * (the seam never captured, or the credit never ran), and the balance is unchanged (we show the
 * current balance, not a projection). Recovery is retry or get help.
 */
function FailedStep({ locale, failed, headingRef, onTryAgain }: FailedStepProps) {
  const { t } = useLocalizedTranslation();
  const balance = failed.balance;

  return (
    <div className="grid gap-5">
      <ResultHead
        tone="danger"
        icon={<AlertTriangle className="size-9 text-danger" aria-hidden="true" />}
        title={t("pages.topUp.failed.title", "Payment didn’t go through")}
        body={
          balance
            ? t(
                "pages.topUp.failed.body",
                "Nothing was charged. Your balance stays {{amount}}, valid until {{date}}.",
                {
                  amount: formatPrice(balance.amountMinor, balance.currency, locale),
                  date: balance.validUntil ? formatShortDate(balance.validUntil, locale) : "—",
                },
              )
            : t(
                "pages.topUp.failed.bodyNoBalance",
                "Nothing was charged. Your balance is unchanged.",
              )
        }
        headingRef={headingRef}
      />

      <div className="grid gap-2">
        <Button className="w-full" onClick={onTryAgain}>
          {t("pages.topUp.failed.tryAgain", "Try again")}
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link to="/support">{t("pages.topUp.failed.getHelp", "Get help")}</Link>
        </Button>
      </div>
    </div>
  );
}
