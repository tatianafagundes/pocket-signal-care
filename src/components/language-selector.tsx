import { useTranslation } from "react-i18next";

import { useTenant } from "@/components/tenant-provider";
import type { Locale } from "@/lib/tenant-rules";

/*
 * Language selector (Fuon). (Spec Fase 2.3 + Req 12)
 *
 * Switches the UI language between the two supported locales (en-US default + de-AT). Each is
 * a pill; the active one gets the accent-tint wash with an accent-ink label (the Fuon
 * "selected" treatment) and aria-pressed, so selection is not colour-only. Switching calls
 * setLocale on the tenant context, which re-runs i18n.changeLanguage; it does not change the
 * tenant/brand.
 */

const LOCALES: { value: Locale; short: string; label: string }[] = [
  { value: "en", short: "EN", label: "English (US)" },
  { value: "de-AT", short: "DE", label: "Deutsch (AT)" },
];

export function LanguageSelector() {
  const { t } = useTranslation();
  const { locale, setLocale } = useTenant();

  return (
    <div
      className="flex items-center gap-1 rounded-pill bg-surface-tint p-0.5"
      role="group"
      aria-label={t("tenant.language", "Language")}
    >
      {LOCALES.map(({ value, short, label }) => {
        const active = locale === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setLocale(value)}
            aria-pressed={active}
            aria-label={label}
            className={
              "min-h-8 rounded-pill px-3 type-caption transition-colors " +
              (active
                ? "bg-accent-tint text-accent-ink"
                : "text-text-secondary hover:text-text-primary")
            }
          >
            {short}
          </button>
        );
      })}
    </div>
  );
}
