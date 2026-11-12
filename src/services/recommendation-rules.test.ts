import { describe, expect, it } from "vitest";

import { recommend, type AssistAnswers } from "@/services/recommendation-rules";
import type { Offer } from "@/services/model";

// A small plan grid mirroring the catalog mock's categories (not its exact ids — the rule reads
// `category`, so any tenant's grid works the same).
const plans: Offer[] = [
  {
    offerId: "p-starter",
    tenantId: "drei",
    name: "Start",
    dataAmount: "5 GB",
    priceMinor: 990,
    currency: "EUR",
    category: "starter",
    recommended: false,
  },
  {
    offerId: "p-standard",
    tenantId: "drei",
    name: "Mid",
    dataAmount: "15 GB",
    priceMinor: 1490,
    currency: "EUR",
    category: "standard",
    recommended: true,
  },
  {
    offerId: "p-unlimited",
    tenantId: "drei",
    name: "Unlimited",
    dataAmount: "Unlimited",
    priceMinor: 2990,
    currency: "EUR",
    category: "unlimited",
    recommended: false,
  },
  // An add-on that must NEVER be recommended.
  {
    offerId: "p-addon",
    tenantId: "drei",
    name: "+1 GB",
    dataAmount: "1 GB",
    priceMinor: 350,
    currency: "EUR",
    kind: "addon",
    category: "data-addon",
  },
];

const ans = (o: Partial<AssistAnswers>): AssistAnswers => ({
  watchesVideo: null,
  travelsEu: null,
  heavyApps: null,
  ...o,
});

describe("recommendation-rules.recommend", () => {
  it("suggests unlimited for video + EU travel", () => {
    const r = recommend(ans({ watchesVideo: true, travelsEu: true }), plans);
    expect(r).toEqual({
      offerId: "p-unlimited",
      reason: "assist.reason.videoAndTravel",
      confidence: "suggested",
    });
  });

  it("suggests standard for video without travel", () => {
    const r = recommend(ans({ watchesVideo: true, travelsEu: false }), plans);
    expect(r?.offerId).toBe("p-standard");
    expect(r?.reason).toBe("assist.reason.video");
  });

  it("suggests standard for a heavy-apps user who doesn't watch video", () => {
    const r = recommend(ans({ watchesVideo: false, heavyApps: true }), plans);
    expect(r?.offerId).toBe("p-standard");
    expect(r?.reason).toBe("assist.reason.heavyApps");
  });

  it("suggests starter for a light user (all no)", () => {
    const r = recommend(ans({ watchesVideo: false, travelsEu: false, heavyApps: false }), plans);
    expect(r?.offerId).toBe("p-starter");
    expect(r?.reason).toBe("assist.reason.light");
  });

  it("always labels the output as a suggestion, never a decision", () => {
    const r = recommend(ans({ watchesVideo: true, travelsEu: true }), plans);
    expect(r?.confidence).toBe("suggested");
  });

  it("falls back to the recommended plan when no plan has the target tier", () => {
    const noUnlimited = plans.filter((o) => o.category !== "unlimited");
    const r = recommend(ans({ watchesVideo: true, travelsEu: true }), noUnlimited);
    expect(r?.offerId).toBe("p-standard"); // the recommended:true plan
    expect(r?.reason).toBe("assist.reason.default");
  });

  it("falls back to the first plan when no tier matches and none is recommended", () => {
    // starter + unlimited only, none recommended; a video-only answer targets "standard" → miss.
    const noStandard = plans
      .filter((o) => o.category === "starter" || o.category === "unlimited")
      .map((o) => ({ ...o, recommended: false }));
    const r = recommend(ans({ watchesVideo: true, travelsEu: false }), noStandard);
    expect(r?.offerId).toBe(noStandard[0]!.offerId); // plans[0] fallback
    expect(r?.reason).toBe("assist.reason.default");
  });

  it("never suggests an add-on, even when the grid is add-ons plus one plan", () => {
    // Every behavioural branch must land on the single plan, never the add-ons.
    const grid = [plans[3]!, { ...plans[3]!, offerId: "p-addon-2" }, plans[0]!];
    for (const a of [
      ans({ watchesVideo: true, travelsEu: true }),
      ans({ watchesVideo: true }),
      ans({ heavyApps: true }),
      ans({ watchesVideo: false, travelsEu: false, heavyApps: false }),
    ]) {
      const r = recommend(a, grid);
      expect(r?.offerId).toBe("p-starter");
    }
  });

  it("returns null when the grid has no plans (only add-ons)", () => {
    expect(recommend(ans({}), [])).toBeNull();
    expect(recommend(ans({ watchesVideo: true, travelsEu: true }), [plans[3]!])).toBeNull();
    // two add-ons, still null — the positive plan filter excludes every add-on.
    expect(recommend(ans({}), [plans[3]!, { ...plans[3]!, offerId: "p-addon-2" }])).toBeNull();
  });
});
