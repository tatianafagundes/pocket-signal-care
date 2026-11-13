import { Link } from "@tanstack/react-router";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import { formatRelativeDays, formatShortDate } from "@/lib/format-date";
import { StatusDot } from "@/components/status/status-dot";
import type { BalanceState, RenewalWhen } from "@/services/customer360-rules";
import type { Balance } from "@/services/model";
import type { Locale } from "@/lib/tenant-rules";

/**
 * Home balance card — the money axis. Each state reads as words: no record yet → first top-up
 * prompt; zero → "No balance" (never a bare €0.00); expired → amount + "Expired on …" in danger.
 * When the balance already covers the next renewal, a calm success line says so (reassurance).
 */
export function BalanceCard({
  balance,
  state,
  locale,
  coversRenewal,
}: {
  balance: Balance | null;
  state: BalanceState;
  locale: Locale;
  /** The next renewal, when the balance already covers it; null hides the reassurance line. */
  coversRenewal: RenewalWhen | null;
}) {
  const { t } = useLocalizedTranslation();
  return (
    <section className="rounded-card border border-hairline bg-surface p-4">
      <h2 className="type-caption text-text-secondary">
        {t("pages.myPlan.balanceLabel", "Saldo")}
      </h2>
      {balance === null || state === "none" ? (
        <p className="mt-1 type-body-sm text-text-secondary">
          {t("pages.myPlan.balanceEmpty", "Ainda sem saldo — faça sua primeira recarga.")}
        </p>
      ) : state === "empty" ? (
        <>
          <p className="mt-1 type-heading text-text-primary">
            {t("pages.home.balance.emptyTitle", "Sem saldo")}
          </p>
          <p className="mt-1 type-body-sm text-text-secondary">
            {t("pages.home.balance.emptyBody", "Recarregue para continuar usando sua linha.")}
          </p>
        </>
      ) : (
        <>
          <p className="mt-1 type-display-number text-text-primary">
            {formatPrice(balance.amountMinor, balance.currency, locale)}
          </p>
          {balance.validUntil ? (
            state === "expired" ? (
              <p className="mt-1 type-body-sm-strong text-danger">
                {t("pages.home.balance.expired", "Expirou em {{date}}", {
                  date: formatShortDate(balance.validUntil, locale),
                })}
              </p>
            ) : (
              <p className="mt-1 type-body-sm text-text-secondary">
                {t("pages.home.validUntil", "Válido até {{date}}", {
                  date: formatShortDate(balance.validUntil, locale),
                })}
              </p>
            )
          ) : null}
          {state === "ok" && coversRenewal ? (
            <p className="mt-2 flex items-center gap-1.5 type-body-sm text-text-primary">
              <StatusDot tone="success" />
              {coversRenewal.relative
                ? t("pages.home.balance.coversRenewalIn", "Cobre sua renovação {{when}}", {
                    when: formatRelativeDays(coversRenewal.days, locale),
                  })
                : t("pages.home.balance.coversRenewalOn", "Cobre sua renovação em {{date}}", {
                    date: formatShortDate(coversRenewal.iso, locale),
                  })}
            </p>
          ) : null}
        </>
      )}
      <Button asChild className="mt-4 min-h-11 w-full">
        <Link to="/top-up">{t("nav.topUp", "Recarregar")}</Link>
      </Button>
    </section>
  );
}
