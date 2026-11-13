import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { StatusDot } from "@/components/status/status-dot";
import type { LineStatus } from "@/services/customer360-rules";
import type { Product } from "@/services/model";

const TONE: Record<LineStatus, string> = {
  active: "bg-success-tint text-success",
  // warning is graphic-only: the word is text-primary, the amber dot carries the colour.
  pending: "bg-warning-tint text-text-primary",
  suspended: "bg-danger-tint text-danger",
};

/** Line status as colour + word, plus the SIM form when known (e.g. "Active · eSIM"). */
export function LineStatusBadge({
  status,
  simType,
}: {
  status: LineStatus;
  simType?: Product["simType"] | null;
}) {
  const { t } = useLocalizedTranslation();
  const word =
    status === "suspended"
      ? t("pages.home.line.suspended", "Suspended")
      : status === "pending"
        ? t("pages.home.line.pending", "Pending")
        : t("pages.home.line.active", "Active");
  const sim =
    simType === "esim"
      ? t("pages.home.line.esim", "eSIM")
      : simType === "physical"
        ? t("pages.home.line.physical", "SIM")
        : null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1 type-caption ${TONE[status]}`}
    >
      {status === "pending" ? <StatusDot tone="warning" /> : null}
      {sim ? `${word} · ${sim}` : word}
    </span>
  );
}
