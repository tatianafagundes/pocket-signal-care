import { Link } from "@tanstack/react-router";
import { ChevronRight, Repeat } from "lucide-react";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";

/**
 * Account entry into the auto top-up screen ("Account › Auto top-up", as the consent copy promises).
 * A plain chevron row — the on/off state and settings live on the destination (P13 off / P15 on),
 * so this stays a single read-free link and doesn't duplicate the preferences query here.
 */
export function AutoTopUpRow() {
  const { t } = useLocalizedTranslation();
  return (
    <Link
      to="/auto-top-up"
      className="focus-ring flex items-center gap-3 rounded-card border border-hairline bg-surface p-4"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-surface-tint">
        <Repeat className="size-5 text-text-secondary" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block type-body-strong text-text-primary">
          {t("pages.account.autoTopUp.title", "Auto top-up")}
        </span>
        <span className="block type-body-sm text-text-secondary">
          {t(
            "pages.account.autoTopUp.sublabel",
            "Top up automatically when your balance runs low.",
          )}
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-text-tertiary" aria-hidden="true" />
    </Link>
  );
}
