import { describe, expect, it } from "vitest";

import { formatMsisdn, formatPrice, offerPriceLabel } from "@/lib/format";
import type { Offer } from "@/services/model";

/*
 * formatPrice pins the platform ICU output per locale. These assert the ACTUAL runtime strings
 * (symbol placement, decimal separator, grouping), not an idealised form — so a change in glyph
 * placement is caught rather than silently shipped.
 */
describe("formatPrice", () => {
  it("formats EUR in en (US) grouping — symbol first, dot decimal", () => {
    expect(formatPrice(1490, "EUR", "en")).toBe("€14.90");
  });

  it("formats EUR in de-AT — symbol first with a non-breaking space, comma decimal", () => {
    // de-AT uses a non-breaking space (U+00A0) between symbol and amount.
    expect(formatPrice(1490, "EUR", "de-AT")).toBe("€\u00A014,90");
  });

  it("formats zero", () => {
    expect(formatPrice(0, "EUR", "en")).toBe("€0.00");
  });

  it("groups thousands in de-AT (dot as the thousands separator)", () => {
    expect(formatPrice(1234567, "EUR", "de-AT")).toBe("€\u00A012.345,67");
  });
});

const baseOffer: Offer = {
  offerId: "drei-up",
  tenantId: "drei",
  name: "up",
  dataAmount: "15 GB",
  priceMinor: 1490,
  currency: "EUR",
};

describe("offerPriceLabel (B4 — a price states its nature)", () => {
  it("labels an auto-renewing plan as recurring, with the cycle", () => {
    const label = offerPriceLabel({ ...baseOffer, validityDays: 30, autoRenew: true }, "en");
    expect(label.key).toBe("onboarding.plan.priceRecurring");
    expect(label.args).toEqual({ price: "€14.90", days: 30 });
  });

  it("labels a fixed-cycle plan (no auto-renew) without the renewal phrase", () => {
    const label = offerPriceLabel({ ...baseOffer, validityDays: 30, autoRenew: false }, "en");
    expect(label.key).toBe("onboarding.plan.priceOnce");
    expect(label.args).toEqual({ price: "€14.90", days: 30 });
  });

  it("labels an offer with no validity (e.g. add-on) as price only", () => {
    const label = offerPriceLabel({ ...baseOffer, autoRenew: true }, "en");
    expect(label.key).toBe("onboarding.plan.priceNoValidity");
    expect(label.args).toEqual({ price: "€14.90" });
  });

  it("formats the price in the active locale", () => {
    const label = offerPriceLabel({ ...baseOffer, validityDays: 30, autoRenew: true }, "de-AT");
    expect(label.args.price).toBe("€\u00A014,90");
  });
});

describe("formatMsisdn", () => {
  it("should group an Austrian mobile number for reading", () => {
    expect(formatMsisdn("+4368140000001")).toBe("+43 681 4000 0001");
  });
  it("should leave a non-Austrian number unchanged", () => {
    expect(formatMsisdn("+491701234567")).toBe("+491701234567");
  });
});
