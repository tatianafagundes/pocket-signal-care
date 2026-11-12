import { afterEach, describe, expect, it, vi } from "vitest";

import { purchaseAddOn } from "@/lib/addon-purchase";

// Mock the api seam surface the orchestration calls (same pattern as onboarding-submit.test).
vi.mock("@/services/api", () => ({
  api: {
    createCart: vi.fn(async () => ({ cartId: "cart-1" })),
    addItem: vi.fn(async (i: { cartId: string }) => ({ cartId: i.cartId })),
    submitOrder: vi.fn(async () => ({ orderId: "order-1", status: "completed" as const })),
  },
}));

import { api } from "@/services/api";

const mockApi = api as unknown as {
  createCart: ReturnType<typeof vi.fn>;
  addItem: ReturnType<typeof vi.fn>;
  submitOrder: ReturnType<typeof vi.fn>;
};

afterEach(() => vi.clearAllMocks());

describe("purchaseAddOn", () => {
  it("runs createCart → addItem → submitOrder for the given customer and add-on", async () => {
    const orderId = await purchaseAddOn("demo-drei", "drei-addon-1gb");

    expect(orderId).toBe("order-1");
    expect(mockApi.createCart).toHaveBeenCalledWith("demo-drei");
    expect(mockApi.addItem).toHaveBeenCalledWith({ cartId: "cart-1", offerId: "drei-addon-1gb" });
    expect(mockApi.submitOrder).toHaveBeenCalledWith({ cartId: "cart-1" });
  });

  it("creates a fresh cart per call (no shared cart across purchases)", async () => {
    await purchaseAddOn("demo-drei", "drei-addon-1gb");
    await purchaseAddOn("demo-drei", "drei-addon-eu-1gb");
    expect(mockApi.createCart).toHaveBeenCalledTimes(2);
  });

  it("propagates a seam failure and does not submit when addItem fails", async () => {
    mockApi.addItem.mockRejectedValueOnce(new Error("add-on unavailable"));
    await expect(purchaseAddOn("demo-drei", "drei-addon-1gb")).rejects.toThrow(
      "add-on unavailable",
    );
    expect(mockApi.submitOrder).not.toHaveBeenCalled();
  });
});
