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

import type { Offer } from "@/services/model";

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

/*
 * Price label descriptor (Spec Fase 5 / Req 7; review finding B4). A price must state its nature:
 * a prepaid "up" plan is a RECURRING charge every N days, not a one-off, and the review/plan step
 * must say so at the point of choice/confirmation. This returns the i18n KEY and interpolation
 * ARGS (the formatted price + validity) so the component renders it through `t()` in the active
 * locale — the pure decision of which phrasing applies lives here and is testable.
 *
 *  - recurring (autoRenew + validityDays): "€14.90 every 30 days · renews, cancel anytime"
 *  - fixed cycle (validityDays, no autoRenew): "€14.90 every 30 days"
 *  - no validity (e.g. an add-on): just the price
 */
export interface PriceLabel {
  key:
    | "onboarding.plan.priceRecurring"
    | "onboarding.plan.priceOnce"
    | "onboarding.plan.priceNoValidity";
  args: { price: string; days?: number };
}

export function offerPriceLabel(offer: Offer, locale: Locale): PriceLabel {
  const price = formatPrice(offer.priceMinor, offer.currency, locale);
  if (offer.validityDays == null) {
    return { key: "onboarding.plan.priceNoValidity", args: { price } };
  }
  if (offer.autoRenew === true) {
    return { key: "onboarding.plan.priceRecurring", args: { price, days: offer.validityDays } };
  }
  return { key: "onboarding.plan.priceOnce", args: { price, days: offer.validityDays } };
}

/**
 * Group an E.164 Austrian mobile number for reading: "+4368140000001" → "+43 681 4000 0001".
 * Anything that is not a +43 number is returned unchanged.
 */
export function formatMsisdn(msisdn: string): string {
  const m = /^\+43(\d{3})(\d+)$/.exec(msisdn);
  if (!m) return msisdn;
  const rest = (m[2] ?? "").replace(/(\d{4})(?=\d)/g, "$1 ");
  return `+43 ${m[1] ?? ""} ${rest}`;
}
