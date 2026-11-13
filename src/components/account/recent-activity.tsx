import { ArrowDownLeft, ArrowUpRight, Headset, RefreshCw, Settings2, UserPlus } from "lucide-react";

import type { FeedItem } from "@/services/customer360-rules";
import type { Locale } from "@/lib/tenant-rules";
import { formatPrice } from "@/lib/format";
import { formatShortDate } from "@/lib/format-date";
import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { StatusDot } from "@/components/status/status-dot";

/*
 * Account "Recent activity" section (Figma P11 "Last top-ups"). Renders the MERGED activity feed
 * (customer360-rules.activityFeed — the money axis unioned with the TMF683 relationship timeline)
 * newest-first, each row an icon + a label + the date, with the signed amount right-aligned when the
 * row is a money event. Sign conveys direction (+ credit / − debit); colour stays neutral because
 * status owns green/amber/red (DESIGN.md). A non-completed entry shows its status word + dot. Empty
 * state when there is no activity.
 *
 * The component takes a `FeedItem[]` — it never touches `Customer360.activity` or `.interactions`
 * directly, so growing either source is a composer change, not a UI change.
 */

export interface RecentActivityProps {
  feed: FeedItem[];
  locale: Locale;
}

export function RecentActivity({ feed, locale }: RecentActivityProps) {
  const { t } = useLocalizedTranslation();

  return (
    <section aria-labelledby="account-activity">
      <h2 id="account-activity" className="type-caption text-text-secondary">
        {t("pages.account.activity.title", "Recent activity")}
      </h2>
      {feed.length === 0 ? (
        <p className="mt-2 type-body-sm text-text-secondary">
          {t("pages.account.activity.empty", "No activity yet.")}
        </p>
      ) : (
        <ul className="mt-2 overflow-hidden rounded-card border border-hairline bg-surface">
          {feed.map((item, i) => (
            <li
              key={item.feedId}
              className={`flex items-center gap-3 p-3 ${i > 0 ? "border-t border-hairline" : ""}`}
            >
              <span
                className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-surface-tint"
                aria-hidden="true"
              >
                <ActivityIcon item={item} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block type-body-sm-strong text-text-primary">
                  {feedLabel(item, t)}
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

/** The row's label: money refills show the offer name; everything else is a localized kind word. */
function feedLabel(item: FeedItem, t: ReturnType<typeof useLocalizedTranslation>["t"]): string {
  if (item.source === "money") {
    if (item.kind === "topUp") return t("pages.account.activity.topUp", "Top-up");
    if (item.kind === "refill")
      return item.offerName ?? t("pages.account.activity.refill", "Add-on");
    return t("pages.account.activity.adjustment", "Adjustment");
  }
  // relationship axis (TMF683)
  if (item.kind === "onboarding") return t("pages.account.activity.onboarding", "Welcome");
  if (item.kind === "planChange") return t("pages.account.activity.planChange", "Plan change");
  if (item.kind === "support") return t("pages.account.activity.support", "Support");
  // a relationship `topUp` interaction, should one ever be recorded
  return t("pages.account.activity.topUp", "Top-up");
}

function ActivityIcon({ item }: { item: FeedItem }) {
  const cls = "size-5 text-text-secondary";
  if (item.source === "relationship") {
    if (item.kind === "onboarding") return <UserPlus className={cls} />;
    if (item.kind === "planChange") return <RefreshCw className={cls} />;
    if (item.kind === "support") return <Headset className={cls} />;
    return <ArrowUpRight className={cls} />;
  }
  if (item.kind === "topUp") return <ArrowUpRight className={cls} />;
  if (item.kind === "refill") return <ArrowDownLeft className={cls} />;
  return <Settings2 className={cls} />;
}

/** Signed money: "+€20.00" credit / "−€3.50" debit. formatPrice handles the locale + absolute value. */
function signedAmount(amountMinor: number, currency: "EUR", locale: Locale): string {
  const sign = amountMinor >= 0 ? "+" : "\u2212"; // real minus sign, not hyphen
  return `${sign}${formatPrice(Math.abs(amountMinor), currency, locale)}`;
}
