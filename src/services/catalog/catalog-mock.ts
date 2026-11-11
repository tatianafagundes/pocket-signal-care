import { ok, err, seamError } from "@/services/seam-result";
import type { Offer } from "@/services/model";
import type { TenantId } from "@/lib/tenant-rules";
import { qualifyOffer as qualifyRule } from "@/services/catalog-rules";
import { withMock } from "@/services/mock-support";
import type { CatalogDriver } from "@/services/catalog/catalog-driver";

/*
 * Catalog (ECM) mock driver. (Spec Fase 4.2)
 *
 * Seeds a small offer grid per tenant, modelled as prepaid activation bundles (a plan with a
 * data allowance, price, and validity). Offers differ by tenant to prove the white-label.
 * qualifyOffer runs the PURE catalog-rules; the balance for an existing customer is read from
 * the charging seam by the caller and passed in the context (kept out of this driver).
 */

const OFFERS: Record<TenantId, Offer[]> = {
  drei: [
    {
      offerId: "drei-plan-5gb",
      tenantId: "drei",
      name: "Prepaid 5 GB",
      dataAmount: "5 GB",
      priceMinor: 999,
      currency: "EUR",
      validityDays: 30,
      recommended: false,
    },
    {
      offerId: "drei-plan-10gb",
      tenantId: "drei",
      name: "Prepaid 10 GB",
      dataAmount: "10 GB",
      priceMinor: 1499,
      currency: "EUR",
      validityDays: 30,
      recommended: true,
    },
    {
      offerId: "drei-plan-unl",
      tenantId: "drei",
      name: "Prepaid Unlimited",
      dataAmount: "Unlimited",
      priceMinor: 2999,
      currency: "EUR",
      validityDays: 30,
      recommended: false,
    },
  ],
  dreigo: [
    {
      offerId: "dreigo-data-8gb",
      tenantId: "dreigo",
      name: "Go 8 GB",
      dataAmount: "8 GB",
      priceMinor: 1199,
      currency: "EUR",
      validityDays: 30,
      recommended: true,
    },
    {
      offerId: "dreigo-data-20gb",
      tenantId: "dreigo",
      name: "Go 20 GB",
      dataAmount: "20 GB",
      priceMinor: 1999,
      currency: "EUR",
      validityDays: 30,
      recommended: false,
    },
  ],
};

export function createCatalogMock(): CatalogDriver {
  return {
    listOffers(tenantId: TenantId) {
      // Return a copy so a caller can't mutate the seed.
      return withMock("catalog.listOffers", () => ok(OFFERS[tenantId].map((o) => ({ ...o }))));
    },

    qualifyOffer(offerId, ctx, balanceMinor) {
      return withMock("catalog.qualifyOffer", () => {
        const offer = OFFERS[ctx.tenantId].find((o) => o.offerId === offerId);
        if (!offer) {
          return err(seamError("catalog.offer.notFound", "notFound", "fixInput"));
        }
        // Onboarding has no customer; add-on purchases do. Balance is supplied by the seam
        // (fetched from charging), not here — this driver owns the catalogue, not the wallet.
        const result = qualifyRule({
          offer,
          hasCustomer: ctx.customerId != null,
          ...(balanceMinor != null ? { balanceMinor } : {}),
        });
        return ok(result);
      });
    },
  };
}
