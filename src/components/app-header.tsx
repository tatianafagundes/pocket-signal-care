import { useLocalizedTranslation } from "@/hooks/use-localized-translation";

import { useTenant } from "@/hooks/use-tenant";
import { LanguageSelector } from "@/components/language-selector";

/*
 * App bar (Fuon). (Spec Fase 2.3)
 *
 * A white app-bar with a 1px hairline under it — no coloured band, no gradient (that was the
 * old bg-hero bridge). The brand surface is the Fuon brand-tile: a flat `accent` rectangle
 * holding the wordmark, the ONLY place the logo renders. Until the official Drei/DreiGo
 * wordmark assets arrive, the tile shows the brand name as a placeholder wordmark (white on
 * the flat accent). Right side: the language selector. Everything sits in the 390px phone column.
 */
export function AppHeader() {
  const { t } = useLocalizedTranslation();
  const { tenantName } = useTenant();

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-surface">
      <div className="mx-auto flex h-14 w-full max-w-[390px] items-center justify-between px-5">
        {/* brand-tile — flat accent, wordmark placeholder (white). No gradient. */}
        <span
          className="inline-flex h-8 items-center rounded-tile bg-accent-brand px-3 type-body-strong text-text-inverse"
          aria-label={t("app.name", tenantName)}
        >
          {tenantName}
        </span>
        <LanguageSelector />
      </div>
    </header>
  );
}
