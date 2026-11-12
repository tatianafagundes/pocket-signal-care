import { afterEach, describe, expect, it } from "vitest";

import { listOffers, qualifyOffer } from "@/services/catalog.functions";
import { clearForcedError, forceError } from "@/services/mock-support";

afterEach(() => clearForcedError());

describe("catalog seam (mock)", () => {
  it("lists tenant-specific offers with one recommended", async () => {
    const drei = await listOffers("drei");
    expect(drei.ok).toBe(true);
    if (drei.ok) {
      expect(drei.data.length).toBeGreaterThan(0);
      expect(drei.data.every((o) => o.tenantId === "drei")).toBe(true);
      expect(drei.data.filter((o) => o.recommended)).toHaveLength(1);
    }
    const dreigo = await listOffers("dreigo");
    if (dreigo.ok) expect(dreigo.data.every((o) => o.tenantId === "dreigo")).toBe(true);
  });

  it("excludes add-ons from the onboarding grid (plans only)", async () => {
    // The Drei grid seeds two add-ons (drei-addon-1gb, drei-addon-eu-1gb); listOffers must not
    // return them — the grid is plans only.
    const drei = await listOffers("drei");
    expect(drei.ok).toBe(true);
    if (drei.ok) {
      expect(drei.data.every((o) => o.kind !== "addon")).toBe(true);
      expect(drei.data.some((o) => o.offerId === "drei-addon-1gb")).toBe(false);
    }
  });

  it("rejects an invalid tenant (validation, never throws)", async () => {
    const r = await listOffers("acme");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.category).toBe("validation");
  });

  it("qualifies an offer during onboarding (no customer)", async () => {
    const r = await qualifyOffer("drei-up", { tenantId: "drei" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.result).toBe("qualified");
  });

  it("fails qualify for an unknown offer", async () => {
    const r = await qualifyOffer("nope", { tenantId: "drei" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("catalog.offer.notFound");
  });

  it("marks an offer unqualified when an existing customer's balance is below the price", async () => {
    // demo-dreigo is seeded with €15.00 (1500c); Go 20 costs €17.90 (1790c) > balance.
    const r = await qualifyOffer("dreigo-go-20", {
      tenantId: "dreigo",
      customerId: "demo-dreigo",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.result).toBe("unqualified");
      expect(r.data.reasonKey).toBe("offer.ineligible.insufficientBalance");
    }
  });

  it("honours a forced error (Req 9.3)", async () => {
    forceError("catalog.listOffers");
    const r = await listOffers("drei");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.category).toBe("unavailable");
  });
});
