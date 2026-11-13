import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import type { UsageBucket } from "@/services/model";
import { bucketState } from "@/services/customer360-rules";
import { consumedFraction, consumedValue, formatQuantity, unitOf } from "@/lib/usage-format";
import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useTenant } from "@/hooks/use-tenant";
import { DataRing } from "@/components/usage/data-ring";

/*
 * Home "Data" card (Figma P1 · "card Data → P10"). Shows the primary data allowance as a ring
 * (consumed arc) plus the authoritative "{remaining} left" text. State comes from bucketState and
 * is conveyed by icon/word + colour, never colour alone (WCAG 1.4.1 / DESIGN.md). Unlimited shows
 * the word with no ring; expired/pending show the word with no misleading number. Links to My plan.
 *
 * When `bucket` is null (no data allowance), renders an empty state instead of a 0-of-0 ring.
 */

export interface UsageSummaryCardProps {
  bucket: UsageBucket | null;
}

export function UsageSummaryCard({ bucket }: UsageSummaryCardProps) {
  const { t } = useLocalizedTranslation();
  const { locale } = useTenant();

  const head = (
    <div className="flex items-center gap-1">
      <h2 className="type-caption text-text-secondary">{t("pages.home.data.title", "Data")}</h2>
      <ChevronRight className="size-5 text-text-tertiary" aria-hidden="true" />
    </div>
  );

  // Localized unit label for a bucket's unit (data GB, voice min, SMS count).
  const unitLabel = (b: UsageBucket): string => {
    switch (unitOf(b)) {
      case "GB":
        return t("usage.unit.gb", "GB");
      case "min":
        return t("usage.unit.min", "min");
      case "sms":
        return t("usage.unit.sms", "SMS");
      default:
        return "";
    }
  };

  let body: React.ReactNode;
  let liveMessage: string | null = null;

  if (bucket === null) {
    body = (
      <p className="mt-2 type-body-sm text-text-secondary">
        {t("pages.home.data.empty", "No data allowance yet.")}
      </p>
    );
  } else if (bucket.unlimited) {
    // Unlimited → the word in the value slot, no ring, no number (Cash App pattern).
    body = (
      <p className="mt-3 type-heading text-text-primary">
        {t("pages.home.data.unlimited", "Unlimited")}
      </p>
    );
  } else {
    const state = bucketState(bucket);
    const unit = unitLabel(bucket);

    if (state === "expired" || state === "pending") {
      // No misleading number — just the status word.
      body = (
        <p className="mt-3 type-body-sm-strong text-text-secondary">
          {state === "expired"
            ? t("usage.state.expired", "Expired")
            : t("usage.state.pending", "Not started yet")}
        </p>
      );
    } else {
      const remaining = bucket.remaining?.value ?? 0;
      const consumed = consumedValue(bucket) ?? 0;
      const remainingLabel = `${formatQuantity(remaining, locale)} ${unit}`;
      const consumedLabel = `${formatQuantity(consumed, locale)} ${unit}`;

      // State word + colour for the "left" line (never colour alone).
      const leftTone =
        state === "depleted"
          ? "text-danger"
          : state === "low"
            ? "text-warning"
            : "text-text-primary";
      const leftText =
        state === "depleted"
          ? t("pages.home.data.none", "No data left")
          : state === "low"
            ? t("pages.home.data.low", "Acabando: {{amount}} restantes", { amount: remainingLabel })
            : t("pages.home.data.left", "{{amount}} left", { amount: remainingLabel });

      // Announce only when attention is needed; ok is silent.
      if (state === "low") {
        liveMessage = t("usage.live.low", "Data running low: {{amount}} left", {
          amount: remainingLabel,
        });
      } else if (state === "depleted") {
        liveMessage = t("usage.live.depleted", "No data left");
      }

      body = (
        <>
          <div className="mt-3">
            <DataRing
              state={state}
              consumedFraction={consumedFraction(bucket)}
              centreValue={consumedLabel}
              centreCaption={t("pages.home.data.used", "used")}
              ariaLabel={t("usage.ring.aria", "{{consumed}} of {{total}} {{unit}} used", {
                consumed: formatQuantity(consumed, locale),
                total: formatQuantity(bucket.total?.value ?? 0, locale),
                unit,
              })}
            />
          </div>
          <p className={`mt-3 type-body-sm-strong ${leftTone}`}>{leftText}</p>
        </>
      );
    }
  }

  return (
    <Link
      to="/my-plan"
      className="focus-ring block rounded-card border border-hairline bg-surface p-4"
      aria-label={t("pages.home.data.cardAria", "Data allowance — open My plan")}
    >
      {head}
      {body}
      {liveMessage ? (
        <span role="status" aria-live="polite" className="sr-only">
          {liveMessage}
        </span>
      ) : null}
    </Link>
  );
}
