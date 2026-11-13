import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import type { LineStatus } from "@/services/customer360-rules";
import type { Product } from "@/services/model";

const TONE: Record<LineStatus, string> = {
  active: "bg-success-tint text-success",
  pending: "bg-warning-tint text-warning",
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
      ? t("pages.home.line.suspended", "Suspensa")
      : status === "pending"
        ? t("pages.home.line.pending", "Pendente")
        : t("pages.home.line.active", "Ativa");
  const sim =
    simType === "esim"
      ? t("pages.home.line.esim", "eSIM")
      : simType === "physical"
        ? t("pages.home.line.physical", "SIM")
        : null;
  return (
    <span className={`rounded-pill px-3 py-1 type-caption ${TONE[status]}`}>
      {sim ? `${word} · ${sim}` : word}
    </span>
  );
}
