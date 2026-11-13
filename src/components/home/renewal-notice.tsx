import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { formatPrice } from "@/lib/format";
import { formatShortDate } from "@/lib/format-date";
import type { Locale } from "@/lib/tenant-rules";

/**
 * Renewal notice — shown only when the balance does not cover the next plan renewal. Warning tint,
 * icon + words (never colour alone), one action with the exact missing amount.
 */
export function RenewalNotice({
  shortfallMinor,
  planName,
  renewsAt,
  locale,
}: {
  shortfallMinor: number;
  planName: string;
  renewsAt: string | null;
  locale: Locale;
}) {
  const { t } = useLocalizedTranslation();
  const amount = formatPrice(shortfallMinor, "EUR", locale);
  return (
    <div className="flex items-start gap-3 rounded-control bg-warning-tint px-4 py-3">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="type-body-sm-strong text-text-primary">
          {renewsAt
            ? t(
                "pages.home.renewal.titleDated",
                "Recarregue {{amount}} para renovar {{plan}} em {{date}}",
                {
                  amount,
                  plan: planName,
                  date: formatShortDate(renewsAt, locale),
                },
              )
            : t("pages.home.renewal.title", "Recarregue {{amount}} para renovar {{plan}}", {
                amount,
                plan: planName,
              })}
        </p>
        <p className="mt-0.5 type-body-sm text-text-secondary">
          {t("pages.home.renewal.body", "Seu saldo ainda não cobre a próxima renovação.")}
        </p>
      </div>
      <Link
        to="/top-up"
        className="focus-ring type-body-sm-strong shrink-0 rounded-pill text-text-primary underline underline-offset-2"
      >
        {t("pages.home.renewal.cta", "Recarregar {{amount}}", { amount })}
      </Link>
    </div>
  );
}
