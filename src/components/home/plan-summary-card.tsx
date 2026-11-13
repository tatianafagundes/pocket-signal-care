import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import type { EnrichedProduct } from "@/services/model";
import type { Locale } from "@/lib/tenant-rules";
import { formatPrice } from "@/lib/format";
import { formatShortDate } from "@/lib/format-date";
import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { StatusDot } from "@/components/status/status-dot";
import { Badge } from "@/components/ui/badge";

/*
 * Home "Plan" card (Figma P1 · "card Plan → P10"). Shows the primary plan's catalogue name, price,
 * next renewal date (or a Pending badge while it activates). Reads the ENRICHED plan (catalogue offer joined), so
 * it shows the commercial name, falling back to the product's own name when no offer resolved.
 * Links to My plan. Renders an empty state when there is no plan yet.
 */

export interface PlanSummaryCardProps {
  plan: EnrichedProduct | null;
  /** When the plan next renews (ISO); shown instead of a repeated "Active" badge. */
  renewsAt: string | null;
  locale: Locale;
}

export function PlanSummaryCard({ plan, renewsAt, locale }: PlanSummaryCardProps) {
  const { t } = useLocalizedTranslation();

  const head = (
    <div className="flex items-center gap-1">
      <h2 className="type-caption text-text-secondary">{t("pages.home.plan.title", "Plan")}</h2>
      <ChevronRight className="size-5 text-text-tertiary" aria-hidden="true" />
    </div>
  );

  return (
    <Link
      to="/my-plan"
      className="focus-ring block rounded-card border border-hairline bg-surface p-4"
      aria-label={t("pages.home.plan.cardAria", "Your plan — open My plan")}
    >
      {head}
      {plan === null ? (
        <p className="mt-2 type-body-sm text-text-secondary">
          {t("pages.home.plan.empty", "No plan yet.")}
        </p>
      ) : (
        <>
          <p className="mt-3 type-heading text-text-primary">{plan.offer?.name ?? plan.name}</p>
          {plan.offer ? (
            <p className="mt-0.5 type-body-sm text-text-secondary tabular-figures">
              {formatPrice(plan.offer.priceMinor, plan.offer.currency, locale)}
            </p>
          ) : null}
          {plan.status === "pending" ? (
            <div className="mt-3">
              <Badge className="gap-1.5 border-transparent bg-warning-tint text-text-primary">
                <StatusDot tone="warning" />
                {t("pages.myPlan.statusPending", "Pendente")}
              </Badge>
            </div>
          ) : renewsAt ? (
            <p className="mt-3 type-body-sm text-text-secondary">
              {t("pages.home.plan.renews", "Renova em {{date}}", {
                date: formatShortDate(renewsAt, locale),
              })}
            </p>
          ) : null}
        </>
      )}
    </Link>
  );
}
