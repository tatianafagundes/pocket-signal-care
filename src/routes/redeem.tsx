import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useTenant } from "@/hooks/use-tenant";
import { useCurrentCustomerId } from "@/lib/current-customer";
import type { Locale } from "@/lib/tenant-rules";
import type { Customer360, VoucherRedemption } from "@/services/model";
import { PageShell } from "@/components/page-shell";
import { SeamErrorNotice } from "@/components/onboarding/seam-error-notice";
import { ResultHead, SummaryRow } from "@/components/result-summary";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { api, asSeamFailure } from "@/services/api";
import { queryKeys } from "@/lib/query-keys";
import { formatMsisdn, formatPrice } from "@/lib/format";
import { formatShortDate, formatDateTime } from "@/lib/format-date";

export const Route = createFileRoute("/redeem")({
  head: () => ({
    meta: [
      { title: "Add a voucher — whitelabel" },
      {
        name: "description",
        content: "Redeem a voucher to add credit to your whitelabel prepaid balance.",
      },
      { property: "og:title", content: "Add a voucher — whitelabel" },
      {
        property: "og:description",
        content: "Redeem a voucher to add credit to your whitelabel prepaid balance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

/** A voucher code is 12 digits. We group them 4-4-4 for legibility while typing. */
const VOUCHER_CODE_DIGITS = 12;

/** Which step of the redeem task is on screen. A reload does not resume a half-finished redeem. */
type Phase = "enter" | "result";

/** A completed redemption, snapshotted for the receipt (the code is masked; never shown in full). */
interface SuccessData {
  redemption: VoucherRedemption;
  /** Last 4 digits of the redeemed code, for a masked "Voucher •••• 8816" receipt line. */
  codeLast4: string;
  redeemedAt: string;
}

/** Strip non-digits and cap at 12 — the raw code we send to the seam. */
function normalizeCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, VOUCHER_CODE_DIGITS);
}

/** Format digits as groups of four ("4471 0392 8816") for the input display. */
function formatCode(digits: string): string {
  return digits.replace(/(.{4})/g, "$1 ").trim();
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

  // The redeem task is a small state machine in one route (not sub-routes): a transient flow that
  // must not be deep-linked or resumed across reloads. Enter is the entry phase.
  const [phase, setPhase] = useState<Phase>("enter");
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [success, setSuccess] = useState<SuccessData | null>(null);

  // Move focus to the result heading on each phase change, so a screen reader announces the new
  // screen (the phases share one route, so there's no route change to announce). WCAG 2.4.3.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (phase === "result") headingRef.current?.focus();
  }, [phase]);

  const digits = normalizeCode(code);
  const complete = digits.length === VOUCHER_CODE_DIGITS;

  async function redeem() {
    // Anti double-submit, and don't call the seam with an incomplete code (the button gates it too).
    if (redeeming || !complete) return;
    setRedeeming(true);
    try {
      // The seam resolves the face value from the code (server-side); we never send an amount.
      const result = await api.redeemVoucher({ customerId, code: digits });
      setSuccess({
        redemption: result,
        codeLast4: digits.slice(-4),
        redeemedAt: new Date().toISOString(),
      });
      // Refresh balance + activity everywhere (Home, Account, My plan).
      void queryClient.invalidateQueries({ queryKey: queryKeys.customer360(tenant, customerId) });
      setPhase("result");
    } catch {
      // The inline error path (invalid / already used / barred) lands in a later increment.
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <PageShell title={t("pages.redeem.title", "Add a voucher")} flush>
      {query.isPending ? (
        <>
          <p className="sr-only" role="status">
            {t("pages.redeem.loading", "Loading your balance…")}
          </p>
          <div className="grid gap-3" aria-hidden="true">
            <Skeleton className="h-20 w-full rounded-card" />
            <Skeleton className="h-40 w-full rounded-card" />
          </div>
        </>
      ) : query.isError ? (
        <SeamErrorNotice
          error={asSeamFailure(query.error, "cpr.getCustomer360")}
          onRetry={() => void query.refetch()}
        />
      ) : phase === "enter" ? (
        <EnterStep
          data={query.data}
          locale={locale}
          code={code}
          onCodeChange={setCode}
          complete={complete}
          redeeming={redeeming}
          onRedeem={() => void redeem()}
        />
      ) : success ? (
        <SuccessStep locale={locale} success={success} headingRef={headingRef} />
      ) : null}
    </PageShell>
  );
}

interface EnterStepProps {
  data: Customer360;
  locale: Locale;
  code: string;
  onCodeChange: (code: string) => void;
  complete: boolean;
  redeeming: boolean;
  onRedeem: () => void;
}

/** P17 "Add a voucher" — enter the 12-digit code; the value comes from the server, not here. */
function EnterStep({
  data,
  locale,
  code,
  onCodeChange,
  complete,
  redeeming,
  onRedeem,
}: EnterStepProps) {
  const { t } = useLocalizedTranslation();
  const balance = data.balance;
  const msisdn = data.party.msisdn;

  return (
    <div className="grid gap-5">
      {/* Context: current balance + whose balance the voucher credits. */}
      <section className="rounded-card bg-surface-tint p-4">
        <p className="type-body-sm-strong text-text-primary">
          {t("pages.redeem.context.balance", "Balance {{amount}} · valid until {{date}}", {
            amount: formatPrice(balance?.amountMinor ?? 0, balance?.currency ?? "EUR", locale),
            date: balance?.validUntil ? formatShortDate(balance.validUntil, locale) : "—",
          })}
        </p>
        {msisdn ? (
          <p className="mt-1 type-body-sm text-text-secondary">
            {t("pages.redeem.context.goesTo", "The voucher goes to {{msisdn}}", {
              msisdn: formatMsisdn(msisdn),
            })}
          </p>
        ) : null}
      </section>

      {/* Voucher code — an editable 12-digit field, grouped 4-4-4 while typing. */}
      <div className="grid gap-2">
        <label htmlFor="voucher-code" className="type-body-sm-strong text-text-primary">
          {t("pages.redeem.codeLabel", "Voucher code")}
        </label>
        <input
          id="voucher-code"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={formatCode(normalizeCode(code))}
          onChange={(e) => onCodeChange(e.target.value)}
          placeholder="4471 0392 8816"
          aria-describedby="voucher-hint-value voucher-hint-code"
          className="focus-ring h-[52px] w-full rounded-control border border-input bg-surface px-4 type-body text-text-primary tabular-figures placeholder:text-text-secondary"
        />
      </div>

      <p id="voucher-hint-value" className="type-body-sm text-text-secondary">
        {t(
          "pages.redeem.hintValue",
          "A voucher adds its value to your balance; €20 or more also sets the validity to 30 days from today.",
        )}
      </p>
      <p id="voucher-hint-code" className="type-body-sm text-text-secondary">
        {t(
          "pages.redeem.hintCode",
          "The code has 12 digits. Find it on the voucher or in the email it came with.",
        )}
      </p>

      <Button
        className="w-full"
        onClick={onRedeem}
        disabled={!complete || redeeming}
        aria-busy={redeeming}
      >
        {redeeming
          ? t("pages.redeem.redeeming", "Adding to balance…")
          : t("pages.redeem.submit", "Add to balance")}
      </Button>
    </div>
  );
}

interface SuccessStepProps {
  locale: Locale;
  success: SuccessData;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}

/** P18 "Voucher added" — the success receipt. The balance line is the honest new state. */
function SuccessStep({ locale, success, headingRef }: SuccessStepProps) {
  const { t } = useLocalizedTranslation();
  const { redemption, codeLast4, redeemedAt } = success;
  const { balance } = redemption;
  const validUntil = balance.validUntil ? formatShortDate(balance.validUntil, locale) : "—";

  return (
    <div className="grid gap-5">
      <ResultHead
        tone="success"
        icon={<Check className="size-9 text-success" aria-hidden="true" />}
        title={t("pages.redeem.success.title", "Voucher added")}
        body={t(
          "pages.redeem.success.body",
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
          label={t("pages.redeem.success.rowReference", "Reference")}
          value={redemption.reference}
        />
        <SummaryRow
          label={t("pages.redeem.success.rowAdded", "Added")}
          value={formatPrice(redemption.creditedMinor, redemption.currency, locale)}
          divider
        />
        <SummaryRow
          label={t("pages.redeem.success.rowVoucher", "Voucher")}
          value={`•••• ${codeLast4}`}
          divider
        />
        <SummaryRow
          label={t("pages.redeem.success.rowDate", "Date")}
          value={formatDateTime(redeemedAt, locale)}
          divider
        />
        <SummaryRow
          label={t("pages.redeem.success.rowNewBalance", "New balance")}
          value={`${formatPrice(balance.amountMinor, balance.currency, locale)} · ${validUntil}`}
          divider
        />
      </div>

      <div className="grid gap-2">
        <Button asChild className="w-full">
          <Link to="/">{t("pages.redeem.success.backHome", "Back to Home")}</Link>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link to="/my-plan">{t("pages.redeem.success.seePlan", "See my plan")}</Link>
        </Button>
      </div>
    </div>
  );
}
