import { Copy } from "lucide-react";
import { toast } from "sonner";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { formatMsisdn } from "@/lib/format";

/** The line number, formatted; tap to copy it (toast confirms). Used on Home and My plan. */
export function CopyNumberButton({ msisdn }: { msisdn: string }) {
  const { t } = useLocalizedTranslation();
  const pretty = formatMsisdn(msisdn);
  return (
    <button
      type="button"
      className="focus-ring flex min-h-11 items-center gap-2 rounded-pill type-body-strong tabular-nums text-text-primary"
      aria-label={`${t("pages.home.line.copy", "Copiar número")}: ${pretty}`}
      onClick={() => {
        const failed = () =>
          toast.error(
            t(
              "pages.home.line.copyFailed",
              "Não deu para copiar agora — tente de novo em instantes.",
            ),
          );
        if (!navigator.clipboard) {
          failed();
          return;
        }
        navigator.clipboard
          .writeText(msisdn)
          .then(() => toast.success(t("pages.home.line.copied", "Número copiado")))
          .catch(failed);
      }}
    >
      {pretty}
      <Copy className="size-4 text-text-tertiary" aria-hidden="true" />
    </button>
  );
}
