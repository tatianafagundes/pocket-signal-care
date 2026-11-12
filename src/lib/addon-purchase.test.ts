import { afterEach, describe, expect, it, vi } from "vitest";

import { allowanceGrantForAddOn, purchaseAddOn } from "@/lib/addon-purchase";
import type { Offer } from "@/services/model";

// Mock the api seam surface the orchestration calls (same pattern as onboarding-submit.test).
vi.mock("@/services/api", () => ({
  api: {
    createCart: vi.fn(async () => ({ cartId: "cart-1" })),
    addItem: vi.fn(async (i: { cartId: string }) => ({ cartId: i.cartId })),
    submitOrder: vi.fn(async () => ({ orderId: "order-1", status: "completed" as const })),
    grantAllowance: vi.fn(async () => ({ bucketId: "bkt-1" })),
  },
}));

import { api } from "@/services/api";

const mockApi = api as unknown as {
  createCart: ReturnType<typeof vi.fn>;
  addItem: ReturnType<typeof vi.fn>;
  submitOrder: ReturnType<typeof vi.fn>;
  grantAllowance: ReturnType<typeof vi.fn>;
};

const dataAddOn: Offer = {
  offerId: "drei-addon-1gb",
  tenantId: "drei",
  name: "+1 GB",
  dataAmount: "1 GB",
  priceMinor: 350,
  currency: "EUR",
  kind: "addon",
  category: "data-addon",
};
const euAddOn: Offer = {
  offerId: "drei-addon-eu-1gb",
  tenantId: "drei",
  name: "+1 GB EU",
  dataAmount: "1 GB",
  priceMinor: 350,
  currency: "EUR",
  euRoaming: true,
  kind: "addon",
  category: "data-addon",
};
const streamingAddOn: Offer = {
  offerId: "dreigo-stream-pass",
  tenantId: "dreigo",
  name: "Streaming pass",
  dataAmount: "Streaming data free*",
  priceMinor: 500,
  currency: "EUR",
  kind: "addon",
  category: "streaming-addon",
};

afterEach(() => vi.clearAllMocks());

describe("allowanceGrantForAddOn", () => {
  it("maps a metered data add-on to a data grant in GB", () => {
    expect(allowanceGrantForAddOn(dataAddOn)).toEqual({
      type: "data",
      offerId: "drei-addon-1gb",
      offerName: "+1 GB",
      amount: 1,
      unit: "GB",
    });
  });

  it("maps a euRoaming add-on to a roaming grant", () => {
    expect(allowanceGrantForAddOn(euAddOn)).toMatchObject({
      type: "roaming",
      amount: 1,
      unit: "GB",
    });
  });

  it("maps an unlimited add-on to an unlimited grant", () => {
    const grant = allowanceGrantForAddOn({
      ...dataAddOn,
      dataAmount: "Unlimited",
      unlimitedData: true,
    });
    expect(grant).toEqual({
      type: "data",
      offerId: "drei-addon-1gb",
      offerName: "+1 GB",
      unlimited: true,
    });
  });

  it("returns null for an add-on whose label is not a parseable quantity (entitlement only)", () => {
    expect(allowanceGrantForAddOn(streamingAddOn)).toBeNull();
  });
});

describe("purchaseAddOn", () => {
  it("runs createCart → addItem → submitOrder then grants the allowance", async () => {
    const orderId = await purchaseAddOn("demo-drei", dataAddOn);

    expect(orderId).toBe("order-1");
    expect(mockApi.createCart).toHaveBeenCalledWith("demo-drei");
    expect(mockApi.addItem).toHaveBeenCalledWith({ cartId: "cart-1", offerId: "drei-addon-1gb" });
    expect(mockApi.submitOrder).toHaveBeenCalledWith({ cartId: "cart-1" });
    expect(mockApi.grantAllowance).toHaveBeenCalledWith({
      customerId: "demo-drei",
      type: "data",
      offerId: "drei-addon-1gb",
      offerName: "+1 GB",
      amount: 1,
      unit: "GB",
    });
  });

  it("grants a roaming bucket for a euRoaming add-on", async () => {
    await purchaseAddOn("demo-drei", euAddOn);
    expect(mockApi.grantAllowance).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "demo-drei", type: "roaming" }),
    );
  });

  it("does not grant an allowance for an entitlement-only add-on", async () => {
    await purchaseAddOn("demo-dreigo", streamingAddOn);
    expect(mockApi.submitOrder).toHaveBeenCalled();
    expect(mockApi.grantAllowance).not.toHaveBeenCalled();
  });

  it("creates a fresh cart per call (no shared cart across purchases)", async () => {
    await purchaseAddOn("demo-drei", dataAddOn);
    await purchaseAddOn("demo-drei", euAddOn);
    expect(mockApi.createCart).toHaveBeenCalledTimes(2);
  });

  it("propagates a seam failure and does not submit or grant when addItem fails", async () => {
    mockApi.addItem.mockRejectedValueOnce(new Error("add-on unavailable"));
    await expect(purchaseAddOn("demo-drei", dataAddOn)).rejects.toThrow("add-on unavailable");
    expect(mockApi.submitOrder).not.toHaveBeenCalled();
    expect(mockApi.grantAllowance).not.toHaveBeenCalled();
  });
});
