import type { Locale } from "@/lib/tenant-rules";

/*
 * Locale-aware formatting. (Spec Fase 5 / Req 7, 9.2)
 *
 * Prices live in the model as minor units (euro cents) + "EUR" — never a float — so there is one
 * place that turns them into a human string, in the active locale. The exact glyph/placement is
 * whatever the platform ICU produces for the locale: en → "€14.90" (en-US), de-AT → "€ 14,90"
 * (symbol first, comma decimal, non-breaking space). Keeping this here (not inline in a component)
 * means every screen formats money the same way, and a future currency/locale change is one edit.
 */

/** Map the app's i18next Locale to a BCP-47 tag Intl understands. "de-AT" is already valid. */
function bcp47(locale: Locale): string {
  return locale === "de-AT" ? "de-AT" : "en-US";
}

/**
 * Format a price given in minor units (cents) and an ISO currency code, in the given locale.
 * e.g. formatPrice(1490, "EUR", "en") → "€14.90"; (1490, "EUR", "de-AT") → "14,90 €".
 */
export function formatPrice(amountMinor: number, currency: string, locale: Locale): string {
  return new Intl.NumberFormat(bcp47(locale), {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}
