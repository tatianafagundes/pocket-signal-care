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

describe("catalog-rules.qualifyOffer (TMF679 tri-state)", () => {
  it("is qualified during onboarding (no customer yet)", () => {
    expect(qualifyOffer({ offer, hasCustomer: false })).toEqual({ result: "qualified" });
  });

  it("is qualified for a customer whose balance covers the price", () => {
    expect(qualifyOffer({ offer, hasCustomer: true, balanceMinor: 2000 })).toEqual({
      result: "qualified",
    });
  });

  it("is unqualified for a customer whose balance is below the price, with a reason key", () => {
    const r = qualifyOffer({ offer, hasCustomer: true, balanceMinor: 500 });
    expect(r.result).toBe("unqualified");
    expect(r.reasonKey).toBe("offer.ineligible.insufficientBalance");
  });

  it("is qualified for a customer when balance is unknown (not enforced)", () => {
    expect(qualifyOffer({ offer, hasCustomer: true })).toEqual({ result: "qualified" });
  });
});
