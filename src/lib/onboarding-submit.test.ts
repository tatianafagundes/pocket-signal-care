import { afterEach, describe, expect, it, vi } from "vitest";

import { runOnboardingSubmit, type SubmitStep } from "@/lib/onboarding-submit";
import { initialOnboardingState } from "@/lib/onboarding-persistence";
import type { OnboardingState } from "@/lib/onboarding-context";

// Mock the api seam surface the orchestration calls.
vi.mock("@/services/api", () => ({
  api: {
    createParty: vi.fn(async () => ({ partyId: "party-1" })),
    createCustomer: vi.fn(async () => ({ customerId: "cust-1" })),
    createCart: vi.fn(async () => ({ cartId: "cart-1" })),
    addItem: vi.fn(async (i: { cartId: string }) => ({ cartId: i.cartId })),
    submitOrder: vi.fn(async () => ({ orderId: "order-1", status: "completed" as const })),
  },
}));

import { api } from "@/services/api";

const mockApi = api as unknown as {
  createParty: ReturnType<typeof vi.fn>;
  createCustomer: ReturnType<typeof vi.fn>;
  createCart: ReturnType<typeof vi.fn>;
  addItem: ReturnType<typeof vi.fn>;
  submitOrder: ReturnType<typeof vi.fn>;
};

afterEach(() => vi.clearAllMocks());

function completeState(over: Partial<OnboardingState> = {}): OnboardingState {
  return {
    ...initialOnboardingState("drei"),
    selectedOfferId: "drei-up",
    email: "a@b.at",
    givenName: "Mia",
    familyName: "Berg",
    ...over,
  };
}

describe("runOnboardingSubmit", () => {
  it("runs the full sequence and returns the customerId", async () => {
    const steps: SubmitStep[] = [];
    const customerId = await runOnboardingSubmit({
      state: completeState(),
      patch: () => {},
      onStep: (s) => steps.push(s),
    });

    expect(customerId).toBe("cust-1");
    expect(steps).toEqual([
      "createParty",
      "createCustomer",
      "createCart",
      "addPlan",
      "addSim",
      "submitOrder",
    ]);
    // Plan then SIM, SIM id derived from tenant.
    expect(mockApi.addItem).toHaveBeenNthCalledWith(1, { cartId: "cart-1", offerId: "drei-up" });
    expect(mockApi.addItem).toHaveBeenNthCalledWith(2, {
      cartId: "cart-1",
      offerId: "drei-sim-po",
    });
  });

  it("reuses an existing party and customer on retry (never recreates durable resources)", async () => {
    const steps: SubmitStep[] = [];
    await runOnboardingSubmit({
      state: completeState({ partyId: "party-existing", customerId: "cust-existing" }),
      patch: () => {},
      onStep: (s) => steps.push(s),
    });

    expect(mockApi.createParty).not.toHaveBeenCalled();
    expect(mockApi.createCustomer).not.toHaveBeenCalled();
    // Cart is still built fresh (ephemeral), items added once.
    expect(mockApi.createCart).toHaveBeenCalledTimes(1);
    expect(steps).toEqual(["createCart", "addPlan", "addSim", "submitOrder"]);
  });

  it("builds a fresh cart even when a stale cartId is present (no duplicate line items)", async () => {
    await runOnboardingSubmit({
      state: completeState({ partyId: "p", customerId: "c", cartId: "cart-stale" }),
      patch: () => {},
      onStep: () => {},
    });
    // A new cart is created; the stale id is not reused for addItem.
    expect(mockApi.createCart).toHaveBeenCalledTimes(1);
    expect(mockApi.addItem).toHaveBeenNthCalledWith(1, { cartId: "cart-1", offerId: "drei-up" });
    expect(mockApi.addItem).toHaveBeenCalledTimes(2);
  });

  it("persists each durable id via patch as it is created", async () => {
    const patches: Record<string, unknown>[] = [];
    await runOnboardingSubmit({
      state: completeState(),
      patch: (p) => patches.push(p),
      onStep: () => {},
    });
    expect(patches).toContainEqual({ partyId: "party-1" });
    expect(patches).toContainEqual({ customerId: "cust-1" });
  });

  it("throws when called with incomplete state", async () => {
    await expect(
      runOnboardingSubmit({
        state: completeState({ selectedOfferId: null }),
        patch: () => {},
        onStep: () => {},
      }),
    ).rejects.toThrow();
  });
});
