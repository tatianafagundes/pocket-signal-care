import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { AlertTriangle } from "lucide-react";

import { useTenant } from "@/hooks/use-tenant";

/*
 * Tenant-not-found recovery. (Spec Fase 2.2 — "tela de tenant inexistente com 'ir para Drei'")
 *
 * When a tenant was explicitly requested via ?tenant= but is unknown, the app has already
 * recovered to Drei (the default) — this banner tells the user that happened and offers a
 * clean link to Drei (strips the bad ?tenant=). It is a Fuon notice-banner: warning tint,
 * colour + word + icon (never colour alone), one action. Renders nothing when all is well.
 */
export function TenantNotFoundBanner() {
  const { t } = useLocalizedTranslation();
  const { requestedUnknown } = useTenant();

  if (!requestedUnknown) return null;

  // "Go to Drei" = this origin + path, with ?tenant= removed.
  const goToDreiHref =
    typeof window === "undefined"
      ? "/"
      : (() => {
          const url = new URL(window.location.href);
          url.searchParams.delete("tenant");
          return url.pathname + url.search;
        })();

  return (
    <div
      role="alert"
      className="mx-auto flex w-full max-w-[390px] items-start gap-3 rounded-control bg-warning-tint px-4 py-3"
    >
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="type-body-sm text-text-primary">
          {t("tenant.notFound", { requested: requestedUnknown })}
        </p>
        <a
          href={goToDreiHref}
          className="focus-ring type-body-sm-strong mt-1 inline-block rounded-pill text-text-primary underline underline-offset-2"
        >
          {t("tenant.goToDrei")}
        </a>
      </div>
    </div>
  );
}
