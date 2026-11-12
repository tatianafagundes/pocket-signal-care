import { ok, err, seamError } from "@/services/seam-result";
import type { Offer } from "@/services/model";
import type { TenantId } from "@/lib/tenant-rules";
import { qualifyOffer as qualifyRule } from "@/services/catalog-rules";
import { withMock } from "@/services/mock-support";
import type { CatalogDriver } from "@/services/catalog/catalog-driver";

/*
 * Catalog (ECM) mock driver. (Spec Fase 4.2 / Fase 5 enrichment)
 *
 * A realistic prepaid grid per tenant, modelled on Drei's "up" line (Drei) and a data-first line
 * (DreiGo), to prove the white-label and give the onboarding plan step something real to show.
 * Prices/allowances are a DEFENSIBLE PLACEHOLDER from public sources — NOT official Drei prices.
 *
 * Each offer carries the enrichment fields (category, network, euRoaming, autoRenew…) a real
 * TMF620 catalogue would express as characteristics; the recommendation rule reads `category`,
 * not hardcoded ids, so it survives a catalogue change. The SIM is NOT a catalogue Offer — the
 * onboarding cart reuses the order seam's "<tenant>-sim-po" provisioning id (see order-mock).
 *
 * listOffers returns PLANS only (kind !== "addon"); add-ons exist in the catalogue for the
 * add-ons route / future use but don't clutter the onboarding grid.
 */

const OFFERS: Record<TenantId, Offer[]> = {
  drei: [
    {
      offerId: "drei-up-start",
      tenantId: "drei",
      name: "up Start",
      dataAmount: "5 GB",
      priceMinor: 990,
      currency: "EUR",
      validityDays: 30,
      autoRenew: true,
      network: "4G",
      category: "starter",
      recommended: false,
    },
    {
      offerId: "drei-up",
      tenantId: "drei",
      name: "up",
      dataAmount: "15 GB",
      priceMinor: 1490,
      currency: "EUR",
      validityDays: 30,
      autoRenew: true,
      euRoaming: true,
      network: "5G",
      category: "standard",
      recommended: true,
    },
    {
      offerId: "drei-up-max",
      tenantId: "drei",
      name: "up Max",
      dataAmount: "40 GB",
      priceMinor: 1990,
      currency: "EUR",
      validityDays: 30,
      autoRenew: true,
      euRoaming: true,
      network: "5G",
      category: "standard",
      recommended: false,
    },
    {
      offerId: "drei-up-unlimited",
      tenantId: "drei",
      name: "up Unlimited+",
      dataAmount: "Unlimited",
      priceMinor: 2990,
      currency: "EUR",
      validityDays: 30,
      autoRenew: true,
      euRoaming: true,
      network: "5G",
      unlimitedData: true,
      category: "unlimited",
      recommended: false,
    },
    // Data add-ons — not shown in the onboarding grid (kind: "addon"), available for the add-ons route.
    {
      offerId: "drei-addon-1gb",
      tenantId: "drei",
      name: "+1 GB",
      dataAmount: "1 GB",
      priceMinor: 350,
      currency: "EUR",
      kind: "addon",
      category: "data-addon",
    },
    {
      offerId: "drei-addon-eu-1gb",
      tenantId: "drei",
      name: "+1 GB EU",
      dataAmount: "1 GB",
      priceMinor: 350,
      currency: "EUR",
      euRoaming: true,
      kind: "addon",
      category: "data-addon",
    },
  ],
  dreigo: [
    {
      offerId: "dreigo-go-8",
      tenantId: "dreigo",
      name: "Go 8",
      dataAmount: "8 GB",
      priceMinor: 990,
      currency: "EUR",
      validityDays: 30,
      autoRenew: true,
      network: "4G",
      category: "starter",
      recommended: true,
    },
    {
      offerId: "dreigo-go-20",
      tenantId: "dreigo",
      name: "Go 20",
      dataAmount: "20 GB",
      priceMinor: 1790,
      currency: "EUR",
      validityDays: 30,
      autoRenew: true,
      euRoaming: true,
      network: "5G",
      category: "standard",
      recommended: false,
    },
    {
      offerId: "dreigo-go-unlimited",
      tenantId: "dreigo",
      name: "Go Unlimited",
      dataAmount: "Unlimited",
      priceMinor: 2490,
      currency: "EUR",
      validityDays: 30,
      autoRenew: true,
      euRoaming: true,
      network: "5G",
      unlimitedData: true,
      category: "unlimited",
      recommended: false,
    },
  ],
};

/** All catalogue offers for a tenant (plans + add-ons) — used internally for qualify/lookup. */
function allOffers(tenantId: TenantId): Offer[] {
  return OFFERS[tenantId];
}

export function createCatalogMock(): CatalogDriver {
  return {
    listOffers(tenantId: TenantId) {
      // Onboarding grid = plans only. Return copies so a caller can't mutate the seed.
      return withMock("catalog.listOffers", () =>
        ok(
          allOffers(tenantId)
            .filter((o) => o.kind !== "addon")
            .map((o) => ({ ...o })),
        ),
      );
    },

    qualifyOffer(offerId, ctx, balanceMinor) {
      return withMock("catalog.qualifyOffer", () => {
        const offer = allOffers(ctx.tenantId).find((o) => o.offerId === offerId);
        if (!offer) {
          return err(seamError("catalog.offer.notFound", "notFound", "fixInput"));
        }
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
