import { useTenant } from "@/components/tenant-provider";
import { LanguageSelector } from "@/components/language-selector";

/*
 * App bar (Fuon). (Spec Fase 2.3)
 *
 * A white app-bar with a 1px hairline under it — no coloured band, no gradient (that was the
 * old bg-hero bridge). The brand surface is the Fuon brand-tile: a flat `accent` rectangle
 * holding the wordmark, the ONLY place the logo renders. Until the official Drei/DreiGo
 * wordmark assets arrive, the tile shows the brand NAME as a placeholder.
 *
 * Contrast: the placeholder is live text, so it uses `ink` (text-primary), NOT white. White on
 * the Drei cyan (#0096c5) is ~3.3:1 and the A1 exception is scoped to the primary button + hero
 * only — it does not cover the tile. Ink on cyan is ~5.9:1 (passes). When the official wordmark
 * IMAGE lands it can be white-on-accent (a graphic, ≥3:1); until then, ink text keeps the
 * placeholder accessible. The tile's text already IS the accessible name, so no aria-label.
 */
export function AppHeader() {
  const { tenantName } = useTenant();

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-surface">
      <div className="mx-auto flex h-14 w-full max-w-[390px] items-center justify-between px-5">
        {/* brand-tile — flat accent, wordmark placeholder (ink text for contrast). No gradient. */}
        <span className="inline-flex h-8 items-center rounded-tile bg-accent-brand px-3 type-body-strong text-ink">
          {tenantName}
        </span>
        <LanguageSelector />
      </div>
    </header>
  );
}
