import { Link } from "@tanstack/react-router";
import { ChevronRight, PackagePlus } from "lucide-react";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import type { HomeDataPrompt } from "@/services/customer360-rules";

/**
 * Home "Add data" card — appears only when data is low or used up (homeDataPrompt), so the way out
 * sits next to the problem. Opens Add-ons. Hidden otherwise: the tab bar already leads there.
 */
export function AddDataCard({
  prompt,
  remainingLabel,
}: {
  prompt: Exclude<HomeDataPrompt, null>;
  remainingLabel: string;
}) {
  const { t } = useLocalizedTranslation();
  return (
    <Link
      to="/add-ons"
      className="focus-ring flex items-center gap-3 rounded-card border border-hairline bg-surface p-4"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-accent-tint">
        <PackagePlus className="size-5 text-accent-ink" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block type-body-strong text-text-primary">
          {t("pages.home.addData.title", "Add data")}
        </span>
        <span className="block type-body-sm text-text-secondary">
          {prompt === "depleted"
            ? t("pages.home.addData.depleted", "Your data is used up. You can add more anytime.")
            : t("pages.home.addData.low", "{{amount}} left. You can add more anytime.", {
                amount: remainingLabel,
              })}
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-text-tertiary" aria-hidden="true" />
    </Link>
  );
}
