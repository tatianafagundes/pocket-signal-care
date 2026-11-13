import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import type { UsageBucket } from "@/services/model";
import { bucketState } from "@/services/customer360-rules";
import { formatQuantity, remainingFraction, unitOf } from "@/lib/usage-format";
import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useTenant } from "@/hooks/use-tenant";
import { DataRing } from "@/components/usage/data-ring";
import { StatusDot, bucketTone } from "@/components/status/status-dot";

/*
 * Home "Data" card (Figma P1 · "card Data → P10"). Shows the primary data allowance as a ring
 * (remaining arc, "{remaining} left" in the centre) plus the total or a state word. State comes from bucketState and
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
      const total = bucket.total?.value ?? 0;
      // Non-breaking space keeps "1.8 GB" together when the line wraps.
      const remainingLabel = `${formatQuantity(remaining, locale)}\u00a0${unit}`;
      const totalLabel = `${formatQuantity(total, locale)}\u00a0${unit}`;
      const tone = bucketTone(state);

      // Under the ring: the total when healthy, else the state word beside its status dot.
      // Words stay text-primary; the dot (and the ring) carry the colour — warning is graphic-only.
      const footText =
        state === "depleted"
          ? t("pages.home.data.none", "No data left")
          : state === "low"
            ? t("usage.state.low", "Running low")
            : t("pages.home.data.ofTotal", "of {{total}}", { total: totalLabel });

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
              remainingFraction={remainingFraction(bucket)}
              centreValue={remainingLabel}
              centreCaption={t("pages.home.data.leftCaption", "left")}
              ariaLabel={t("usage.ring.ariaLeft", "{{remaining}} of {{total}} {{unit}} left", {
                remaining: formatQuantity(remaining, locale),
                total: formatQuantity(total, locale),
                unit,
              })}
            />
          </div>
          <p
            className={`mt-3 flex items-center gap-1.5 ${
              tone ? "type-body-sm-strong text-text-primary" : "type-body-sm text-text-secondary"
            }`}
          >
            {tone ? <StatusDot tone={tone} /> : null}
            {footText}
          </p>
        </>
      );
    }
  }

  return (
    <>
      <Link
        to="/my-plan"
        className="focus-ring block rounded-card border border-hairline bg-surface p-4"
      >
        {head}
        {body}
        <span className="sr-only">{t("pages.home.openMyPlan", "— open My plan")}</span>
      </Link>
      {/* Outside the link so the announcement is not repeated in the link's name. */}
      {liveMessage ? (
        <span role="status" aria-live="polite" className="sr-only">
          {liveMessage}
        </span>
      ) : null}
    </>
  );
}
