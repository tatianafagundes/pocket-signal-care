import { describe, expect, it } from "vitest";
import type { Offer } from "@/services/model";
import { onboardingTodayTotal } from "@/lib/onboarding-total";

const offer = (offerId: string, priceMinor: number): Offer => ({
  offerId,
  tenantId: "drei",
  name: offerId,
  dataAmount: "1 GB",
  priceMinor,
  currency: "EUR",
});

const PLAN = offer("plan", 1500);
const CATALOG = [offer("roam", 500), offer("data", 300)];

describe("onboardingTodayTotal", () => {
  it("should charge only the plan price when no extras are ticked", () => {
    const total = onboardingTodayTotal(PLAN, CATALOG, []);
    expect(total.totalMinor).toBe(1500);
    expect(total.extrasMinor).toBe(0);
  });

  it("should add every ticked extra to what is paid today", () => {
    const total = onboardingTodayTotal(PLAN, CATALOG, ["roam", "data"]);
    expect(total.extrasMinor).toBe(800);
    expect(total.totalMinor).toBe(2300);
    expect(total.planMinor).toBe(1500);
  });

  it("should flag a ticked extra that is not in the catalogue", () => {
    expect(onboardingTodayTotal(PLAN, CATALOG, ["gone"]).unresolved).toBe(true);
    expect(onboardingTodayTotal(PLAN, undefined, ["roam"]).unresolved).toBe(true);
    expect(onboardingTodayTotal(PLAN, CATALOG, ["roam"]).unresolved).toBe(false);
  });
});
