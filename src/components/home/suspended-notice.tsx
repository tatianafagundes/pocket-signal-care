import { Link } from "@tanstack/react-router";
import { AlertOctagon } from "lucide-react";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";

/** Danger notice for a suspended line, with a way to Support. Icon + words, never colour alone. */
export function SuspendedNotice() {
  const { t } = useLocalizedTranslation();
  return (
    <div className="flex items-start gap-3 rounded-control bg-danger-tint px-4 py-3">
      <AlertOctagon className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="type-body-sm-strong text-text-primary">
          {t("pages.home.line.suspendedTitle", "Sua linha está suspensa")}
        </p>
        <p className="mt-0.5 type-body-sm text-text-secondary">
          {t(
            "pages.home.line.suspendedBody",
            "Chamadas e dados estão pausados. Nossa equipe pode ajudar a reativar.",
          )}
        </p>
      </div>
      <Link
        to="/support"
        className="focus-ring type-body-sm-strong shrink-0 rounded-pill text-danger"
      >
        {t("pages.home.line.suspendedCta", "Pedir ajuda")}
      </Link>
    </div>
  );
}
