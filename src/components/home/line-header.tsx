import { Link } from "@tanstack/react-router";
import { AlertOctagon } from "lucide-react";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { CopyNumberButton } from "@/components/line/copy-number-button";
import { LineStatusBadge } from "@/components/line/line-status-badge";
import type { LineStatus } from "@/services/customer360-rules";
import type { Product } from "@/services/model";

/**
 * Home line identity: number (tap to copy) + status badge. A suspended line also gets a short
 * explanation and a way to Support — the state is never shown by colour alone.
 */
export function LineHeader({
  msisdn,
  simType,
  status,
}: {
  msisdn: string | undefined;
  simType: Product["simType"] | null;
  status: LineStatus;
}) {
  const { t } = useLocalizedTranslation();
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {msisdn ? <CopyNumberButton msisdn={msisdn} /> : <span />}
        <LineStatusBadge status={status} simType={simType} />
      </div>
      {status === "suspended" ? (
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
      ) : null}
    </div>
  );
}
