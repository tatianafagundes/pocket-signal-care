import { Link } from "@tanstack/react-router";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useTenant } from "@/hooks/use-tenant";
import { Progress } from "@/components/ui/progress";
import { bucketState } from "@/services/customer360-rules";
import { formatQuantity, remainingFraction, unitOf } from "@/lib/usage-format";
import { StatusDot, bucketTone } from "@/components/status/status-dot";
import type { BucketState, UsageBucket } from "@/services/model";

const BAR_TONE: Record<BucketState, string> = {
  ok: "bg-accent-brand",
  low: "bg-warning",
  depleted: "bg-danger",
  expired: "bg-hairline",
  pending: "bg-hairline",
};

/**
 * One allowance on My plan: name, "x of y left" (the authoritative text a screen reader reads),
 * a thin bar filled to what is LEFT (matching the Home ring), and a state word when attention is
 * needed — the word stays text colour; the dot and bar carry the status colour.
 */
export function AllowanceRow({
  bucket,
  canAddRoaming = false,
}: {
  bucket: UsageBucket;
  /** Whether the tenant sells a roaming top-up — gates the roaming bucket's "Add roaming" CTA. */
  canAddRoaming?: boolean;
}) {
  const { t } = useLocalizedTranslation();
  const { locale } = useTenant();
  const state = bucketState(bucket);
  const unit = (() => {
    switch (unitOf(bucket)) {
      case "GB":
        return t("usage.unit.gb", "GB");
      case "min":
        return t("usage.unit.min", "min");
      case "sms":
        return t("usage.unit.sms", "SMS");
      default:
        return "";
    }
  })();

  const amount = bucket.unlimited
    ? t("pages.myPlan.unlimited", "Unlimited")
    : bucket.remaining && bucket.total
      ? t("pages.myPlan.left", "{{remaining}} of {{total}} left", {
          // Unit once, on the total: "175 of 200 SMS left".
          remaining: formatQuantity(bucket.remaining.value, locale),
          total: `${formatQuantity(bucket.total.value, locale)}\u00a0${unit}`,
        })
      : "";

  const stateWord =
    state === "low"
      ? t("usage.state.low", "Running low")
      : state === "depleted"
        ? t("usage.state.depleted", "Used up")
        : state === "expired"
          ? t("usage.state.expired", "Expired")
          : state === "pending"
            ? t("usage.state.pending", "Not started yet")
            : null;
  const tone = bucketTone(state);

  return (
    <li className="p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="type-body text-text-primary">
          {t(`pages.myPlan.type.${bucket.type}`, bucket.type)}
        </span>
        <span className="type-body-sm text-text-secondary tabular-nums">{amount}</span>
      </div>
      {!bucket.unlimited && bucket.total ? (
        <Progress
          value={Math.round(remainingFraction(bucket) * 100)}
          aria-hidden="true"
          className="mt-2 h-1.5 bg-hairline"
          indicatorClassName={BAR_TONE[state]}
        />
      ) : null}
      {stateWord ? (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p
            className={`flex items-center gap-1.5 type-caption ${
              tone ? "text-text-primary" : "text-text-secondary"
            }`}
          >
            {tone ? <StatusDot tone={tone} /> : null}
            {stateWord}
          </p>
          {tone && bucket.type === "data" ? (
            <Link
              to="/add-ons"
              className="focus-ring type-body-sm-strong shrink-0 rounded-pill text-accent-ink"
            >
              {t("pages.myPlan.addData", "Add data")}
            </Link>
          ) : null}
        </div>
      ) : null}
      {/*
       * Roaming is a PROACTIVE buy — a traveller tops up before the trip, not once the allowance
       * runs low — so, unlike the remedial "Add data" CTA above, this shows whenever the tenant
       * actually sells a roaming add-on (canAddRoaming), regardless of the bucket's state. A quiet
       * text link, not a loud button: it offers, it doesn't nag.
       */}
      {bucket.type === "roaming" && canAddRoaming ? (
        <div className="mt-1.5 flex justify-end">
          <Link
            to="/add-ons"
            className="focus-ring type-body-sm-strong shrink-0 rounded-pill text-accent-ink"
          >
            {t("pages.myPlan.addRoaming", "Add roaming")}
          </Link>
        </div>
      ) : null}
    </li>
  );
}
