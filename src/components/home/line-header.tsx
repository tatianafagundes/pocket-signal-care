import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { CopyNumberButton } from "@/components/line/copy-number-button";
import { LineStatusBadge } from "@/components/line/line-status-badge";
import type { LineStatus } from "@/services/customer360-rules";
import type { Product } from "@/services/model";

/**
 * Home line identity, shown right under the greeting: number (tap to copy) + status badge.
 * A pending line also gets one calm sentence; a suspended line's notice lives in SuspendedNotice.
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
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {msisdn ? <CopyNumberButton msisdn={msisdn} /> : <span />}
        <LineStatusBadge status={status} simType={simType} />
      </div>
      {status === "pending" ? (
        <p className="type-body-sm text-text-secondary">
          {t(
            "pages.home.line.pendingBody",
            "Estamos ativando sua linha — isso costuma levar poucos minutos.",
          )}
        </p>
      ) : null}
    </div>
  );
}
