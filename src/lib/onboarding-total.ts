import type { Offer } from "@/services/model";

/*
 * What the customer pays today at the end of onboarding: the plan price (which becomes the first
 * prepaid balance) plus every extra they ticked on Review. Pure so the money rule is testable.
 */
export interface OnboardingTodayTotal {
  planMinor: number;
  /** The ticked extras that resolved from the catalogue, in catalogue order. */
  extras: Offer[];
  extrasMinor: number;
  totalMinor: number;
  /** True when a ticked extra is missing from the catalogue (or it hasn't loaded yet). */
  unresolved: boolean;
}

export function onboardingTodayTotal(
  plan: Offer,
  addOnCatalog: readonly Offer[] | undefined,
  selectedAddOnIds: readonly string[],
): OnboardingTodayTotal {
  const catalog = addOnCatalog ?? [];
  const extras = catalog.filter((a) => selectedAddOnIds.includes(a.offerId));
  const unresolved = selectedAddOnIds.some((id) => !catalog.some((a) => a.offerId === id));
  const extrasMinor = extras.reduce((sum, a) => sum + a.priceMinor, 0);
  return {
    planMinor: plan.priceMinor,
    extras,
    extrasMinor,
    totalMinor: plan.priceMinor + extrasMinor,
    unresolved,
  };
}
