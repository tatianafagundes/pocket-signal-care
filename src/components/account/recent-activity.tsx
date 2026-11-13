import { ArrowDownLeft, ArrowUpRight, Settings2 } from "lucide-react";

import type { ActivityItem } from "@/services/model";
import type { Locale } from "@/lib/tenant-rules";
import { formatPrice } from "@/lib/format";
import { formatShortDate } from "@/lib/format-date";
import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { StatusDot } from "@/components/status/status-dot";

/*
 * Account "Recent activity" section (Figma P11 "Last top-ups"). Renders the money-axis financial
 * feed (Customer360.activity — top-ups, refills, adjustments) newest-first, each row an icon + a
 * label + the date, with the signed amount right-aligned. Sign conveys direction (+ credit / −
 * debit); colour stays neutral because status owns green/amber/red (DESIGN.md). A non-completed
 * entry shows its status word + dot. Empty state when there is no activity.
 *
 * Step 1: financial activity only. A later step merges Party Interactions into the same feed.
 */

export interface RecentActivityProps {
  activity: ActivityItem[];
  locale: Locale;
}

export function RecentActivity({ activity, locale }: RecentActivityProps) {
  const { t } = useLocalizedTranslation();

  return (
    <section aria-labelledby="account-activity">
      <h2 id="account-activity" className="type-caption text-text-secondary">
        {t("pages.account.activity.title", "Recent activity")}
      </h2>
      {activity.length === 0 ? (
        <p className="mt-2 type-body-sm text-text-secondary">
          {t("pages.account.activity.empty", "No activity yet.")}
        </p>
      ) : (
        <ul className="mt-2 overflow-hidden rounded-card border border-hairline bg-surface">
          {activity.map((item, i) => (
            <li
              key={item.activityId}
              className={`flex items-center gap-3 p-3 ${i > 0 ? "border-t border-hairline" : ""}`}
            >
              <span
                className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-surface-tint"
                aria-hidden="true"
              >
                <ActivityIcon kind={item.kind} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block type-body-sm-strong text-text-primary">
                  {item.kind === "topUp"
                    ? t("pages.account.activity.topUp", "Top-up")
                    : item.kind === "refill"
                      ? (item.offerName ?? t("pages.account.activity.refill", "Add-on"))
                      : t("pages.account.activity.adjustment", "Adjustment")}
                </span>
                <span className="mt-0.5 block type-caption text-text-secondary">
                  {formatShortDate(item.occurredAt, locale)}
                </span>
                {item.status !== "completed" ? (
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <StatusDot tone={item.status === "failed" ? "danger" : "warning"} />
                    <span className="type-caption text-text-secondary">
                      {item.status === "failed"
                        ? t("pages.account.activity.failed", "Failed")
                        : t("pages.account.activity.pending", "Pending")}
                    </span>
                  </span>
                ) : null}
              </span>
              {item.amountMinor !== undefined && item.currency ? (
                <span className="shrink-0 type-body-sm-strong text-text-primary tabular-figures">
                  {signedAmount(item.amountMinor, item.currency, locale)}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ActivityIcon({ kind }: { kind: ActivityItem["kind"] }) {
  const cls = "size-5 text-text-secondary";
  if (kind === "topUp") return <ArrowUpRight className={cls} />;
  if (kind === "refill") return <ArrowDownLeft className={cls} />;
  return <Settings2 className={cls} />;
}

/** Signed money: "+€20.00" credit / "−€3.50" debit. formatPrice handles the locale + absolute value. */
function signedAmount(amountMinor: number, currency: "EUR", locale: Locale): string {
  const sign = amountMinor >= 0 ? "+" : "\u2212"; // real minus sign, not hyphen
  return `${sign}${formatPrice(Math.abs(amountMinor), currency, locale)}`;
}
