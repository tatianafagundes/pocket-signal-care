import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import type { EnrichedProduct } from "@/services/model";
import type { Locale } from "@/lib/tenant-rules";
import { formatPrice } from "@/lib/format";
import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { Badge } from "@/components/ui/badge";

/*
 * Home "Plan" card (Figma P1 · "card Plan → P10"). Shows the primary plan's catalogue name, price,
 * renewal and an Active/Pending status badge. Reads the ENRICHED plan (catalogue offer joined), so
 * it shows the commercial name, falling back to the product's own name when no offer resolved.
 * Links to My plan. Renders an empty state when there is no plan yet.
 */

export interface PlanSummaryCardProps {
  plan: EnrichedProduct | null;
  locale: Locale;
}

export function PlanSummaryCard({ plan, locale }: PlanSummaryCardProps) {
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
          <div className="mt-3">
            <Badge
              className={
                plan.status === "active"
                  ? "border-transparent bg-success-tint text-success"
                  : "border-transparent bg-warning-tint text-warning"
              }
            >
              {plan.status === "active"
                ? t("pages.myPlan.statusActive", "Active")
                : t("pages.myPlan.statusPending", "Pending")}
            </Badge>
          </div>
        </>
      )}
    </Link>
  );
}
