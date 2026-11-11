import { describe, expect, it } from "vitest";

import { qualifyOffer } from "@/services/catalog-rules";
import type { Offer } from "@/services/model";

const offer: Offer = {
  offerId: "o1",
  tenantId: "drei",
  name: "Prepaid 10 GB",
  dataAmount: "10 GB",
  priceMinor: 1499,
  currency: "EUR",
  validityDays: 30,
  recommended: true,
};

describe("catalog-rules.qualifyOffer", () => {
  it("is eligible during onboarding (no customer yet)", () => {
    expect(qualifyOffer({ offer, hasCustomer: false })).toEqual({ eligible: true });
  });

  it("is eligible for a customer whose balance covers the price", () => {
    expect(qualifyOffer({ offer, hasCustomer: true, balanceMinor: 2000 })).toEqual({
      eligible: true,
    });
  });

  it("is ineligible for a customer whose balance is below the price, with a reason key", () => {
    const r = qualifyOffer({ offer, hasCustomer: true, balanceMinor: 500 });
    expect(r.eligible).toBe(false);
    expect(r.reasonKey).toBe("offer.ineligible.insufficientBalance");
  });

  it("is eligible for a customer when balance is unknown (not enforced)", () => {
    expect(qualifyOffer({ offer, hasCustomer: true })).toEqual({ eligible: true });
  });
});
