import { useTenant } from "@/hooks/use-tenant";
import { LanguageSelector } from "@/components/language-selector";
import { tenantLogo } from "@/lib/tenant-rules";

/*
 * App bar (Fuon). (Spec Fase 2.3)
 *
 * A white app-bar with a 1px hairline under it — no coloured band, no gradient. The brand logo
 * is the ONLY place the mark renders. It sits directly on the white app-bar (like drei.at,
 * where the "3" mark sits on white), NOT inside a coloured tile — so the logo reads on its own
 * and we don't put brand chrome behind it. The logo + alt come from the active tenant
 * (tenantLogo / tenantName). Right side: the language selector. 390px phone column.
 *
 * Assets live in /public/brands (Drei = official "3" mark; DreiGo = placeholder until a real
 * asset exists). Height-constrained; width auto so any wordmark keeps its aspect ratio.
 */
export function AppHeader() {
  const { tenant, tenantName } = useTenant();

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-surface">
      <div className="mx-auto flex h-14 w-full max-w-[390px] items-center justify-between px-5">
        <img
          src={tenantLogo(tenant)}
          alt={tenantName}
          className="h-8 w-auto"
          // The logo is the accessible brand name; decorative wrapper not needed.
        />
        <LanguageSelector />
      </div>
    </header>
  );
}
