import { describe, expect, it } from "vitest";

import {
  allowanceGb,
  estimateMonthlyGb,
  recommend,
  type AssistAnswers,
} from "@/services/recommendation-rules";
import type { Offer } from "@/services/model";

// A grid mirroring the Drei catalogue: the starter has no EU roaming, the rest do.
const plan = (o: Partial<Offer> & Pick<Offer, "offerId" | "dataAmount" | "priceMinor">): Offer => ({
  tenantId: "drei",
  name: o.offerId,
  currency: "EUR",
  ...o,
});
const plans: Offer[] = [
  plan({ offerId: "start", dataAmount: "5 GB", priceMinor: 990 }),
  plan({
    offerId: "up",
    dataAmount: "15 GB",
    priceMinor: 1490,
    euRoaming: true,
    recommended: true,
  }),
  plan({ offerId: "max", dataAmount: "40 GB", priceMinor: 1990, euRoaming: true }),
  plan({
    offerId: "unl",
    dataAmount: "Unlimited",
    priceMinor: 2990,
    euRoaming: true,
    unlimitedData: true,
  }),
  plan({ offerId: "addon", dataAmount: "1 GB", priceMinor: 350, kind: "addon" }),
];

const ans = (o: Partial<AssistAnswers> = {}): AssistAnswers => ({
  video: "rarely",
  social: "messages",
  hotspot: "never",
  travelsEu: false,
  ...o,
});

describe("recommendation-rules", () => {
  it("should estimate 2 GB a month for a light user", () => {
    expect(estimateMonthlyGb(ans())).toBe(2);
  });

  it("should estimate 13 GB for daily video plus some social", () => {
    expect(estimateMonthlyGb(ans({ video: "daily", social: "some" }))).toBe(13);
  });

  it("should read allowances from the data label and treat unlimited as infinite", () => {
    expect(allowanceGb(plans[0]!)).toBe(5);
    expect(allowanceGb(plans[3]!)).toBe(Number.POSITIVE_INFINITY);
    expect(allowanceGb(plan({ offerId: "x", dataAmount: "Lots", priceMinor: 1 }))).toBeNull();
  });

  it("should suggest the cheapest plan for a light user at home", () => {
    const r = recommend(ans(), plans);
    expect(r?.offerId).toBe("start");
    expect(r?.reason).toBe("assist.reason.fits");
    expect(r?.confidence).toBe("suggested");
  });

  it("should suggest a roaming plan when the light user travels in the EU", () => {
    const r = recommend(ans({ travelsEu: true }), plans);
    expect(r?.offerId).toBe("up");
    expect(r?.includesEuRoaming).toBe(true);
  });

  it("should flag a close fit when 13 GB lands on the 15 GB plan", () => {
    const r = recommend(ans({ video: "daily", social: "some" }), plans);
    expect(r?.offerId).toBe("up");
    expect(r?.reason).toBe("assist.reason.closeFit");
    expect(r?.cheaperAlternative).toBeUndefined();
  });

  it("should suggest 40 GB for 19 GB and mention the 15 GB plan saves 5 euros", () => {
    const r = recommend(ans({ video: "daily", social: "lots" }), plans);
    expect(r?.offerId).toBe("max");
    expect(r?.cheaperAlternative).toEqual({ offerId: "up", savingMinor: 500 });
  });

  it("should suggest unlimited for hours of video, lots of social and frequent hotspot", () => {
    const r = recommend(ans({ video: "hours", social: "lots", hotspot: "often" }), plans);
    expect(r?.offerId).toBe("unl");
    expect(r?.reason).toBe("assist.reason.unlimited");
  });

  it("should suggest the largest plan when usage exceeds every allowance", () => {
    const finite = plans.filter((o) => o.offerId !== "unl");
    const r = recommend(ans({ video: "hours", social: "lots", hotspot: "often" }), finite);
    expect(r?.offerId).toBe("max");
    expect(r?.reason).toBe("assist.reason.biggest");
  });

  it("should fall back to the recommended plan when no allowance can be read", () => {
    const unreadable = plans.map((o) => ({ ...o, dataAmount: "?", unlimitedData: false }));
    const r = recommend(ans(), unreadable);
    expect(r?.offerId).toBe("up");
    expect(r?.reason).toBe("assist.reason.default");
  });

  it("should never suggest an add-on", () => {
    const grid = [plans[4]!, plans[0]!];
    for (const a of [ans(), ans({ video: "hours", social: "lots", hotspot: "often" })]) {
      expect(recommend(a, grid)?.offerId).toBe("start");
    }
  });

  it("should return null when the grid has no plans", () => {
    expect(recommend(ans(), [plans[4]!])).toBeNull();
  });
});
