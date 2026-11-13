import { afterEach, describe, expect, it, vi } from "vitest";

import { runOnboardingSubmit, type SubmitStep } from "@/lib/onboarding-submit";
import { initialOnboardingState } from "@/lib/onboarding-persistence";
import type { OnboardingState } from "@/lib/onboarding-context";
import type { DeliveryAddress } from "@/services/model";

// Mock the api seam surface the orchestration calls. (Fase 7.4 adds the money + fulfilment calls.)
vi.mock("@/services/api", () => ({
  api: {
    authorizePayment: vi.fn(async () => ({
      authorizationRef: "auth-1",
      amountMinor: 1000,
      currency: "EUR" as const,
      status: "authorized" as const,
    })),
    createParty: vi.fn(async () => ({ partyId: "party-1" })),
    createCustomer: vi.fn(async () => ({ customerId: "cust-1" })),
    createContract: vi.fn(async () => ({ contractId: "contract-1" })),
    createAddress: vi.fn(async () => ({
      addressId: "addr-1",
      address: {} as DeliveryAddress,
    })),
    requestEsimProfile: vi.fn(async () => ({
      esimProfileId: "esim-1",
      iccid: "8931430000000000000",
      activationCode: "LPA:1$smdp.drei.at$ABC",
      status: "ready" as const,
    })),
    createCart: vi.fn(async () => ({ cartId: "cart-1" })),
    addItem: vi.fn(async (i: { cartId: string }) => ({ cartId: i.cartId })),
    submitOrder: vi.fn(async () => ({ orderId: "order-1", status: "completed" as const })),
    createInteraction: vi.fn(async () => ({
      interactionId: "pi-1",
      partyId: "party-1",
      customerId: "cust-1",
      tenantId: "drei" as const,
      type: "onboarding" as const,
      status: "completed" as const,
      occurredAt: "2026-01-15T10:00:00Z",
    })),
    capturePayment: vi.fn(async () => ({
      authorizationRef: "auth-1",
      amountMinor: 1000,
      currency: "EUR" as const,
      status: "captured" as const,
    })),
    topUp: vi.fn(async () => ({ amountMinor: 1000, currency: "EUR" as const })),
    grantAllowance: vi.fn(async () => ({
      bucketId: "bkt-1",
      type: "data" as const,
      offerId: "drei-up",
      total: { value: 10, unit: "GB" as const },
      remaining: { value: 10, unit: "GB" as const },
    })),
  },
}));

import { api } from "@/services/api";

const mockApi = api as unknown as Record<
  | "authorizePayment"
  | "createParty"
  | "createCustomer"
  | "createContract"
  | "createAddress"
  | "requestEsimProfile"
  | "createCart"
  | "addItem"
  | "submitOrder"
  | "createInteraction"
  | "capturePayment"
  | "topUp"
  | "grantAllowance",
  ReturnType<typeof vi.fn>
>;

afterEach(() => vi.clearAllMocks());

const ADDRESS: DeliveryAddress = {
  line1: "Rennweg 97",
  city: "Wien",
  region: "Wien",
  postalCode: "1030",
  country: "AT",
};

function completeState(over: Partial<OnboardingState> = {}): OnboardingState {
  return {
    ...initialOnboardingState("drei"),
    selectedOfferId: "drei-up",
    email: "a@b.at",
    givenName: "Mia",
    familyName: "Berg",
    // A real onboarding reserves the MSISDN before review, so the contract step always has it.
    reservedMsisdn: "+4368140000001",
    ...over,
  };
}

const deps = (state: OnboardingState, steps: SubmitStep[], patches: Record<string, unknown>[]) => ({
  state,
  patch: (p: Record<string, unknown>) => patches.push(p),
  onStep: (s: SubmitStep) => steps.push(s),
  planPriceMinor: 1000,
  methodToken: "tok-visa-4242",
});

describe("runOnboardingSubmit — three money moments + idempotency (Fase 7.4)", () => {
  it("runs authorize → party → customer → cart → submit → capture → credit (no SIM form)", async () => {
    const steps: SubmitStep[] = [];
    const customerId = await runOnboardingSubmit(deps(completeState(), steps, []));

    expect(customerId).toBe("cust-1");
    expect(steps).toEqual([
      "authorize",
      "createParty",
      "createCustomer",
      "createContract",
      "createCart",
      "addPlan",
      "addSim",
      "submitOrder",
      "recordInteraction",
      "capture",
      "credit",
    ]);
    // Authorize reserves the plan price; credit tops up the same amount.
    expect(mockApi.authorizePayment).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinor: 1000, methodToken: "tok-visa-4242" }),
    );
    expect(mockApi.capturePayment).toHaveBeenCalledWith({ authorizationRef: "auth-1" });
    expect(mockApi.topUp).toHaveBeenCalledWith({ customerId: "cust-1", amountMinor: 1000 });
  });

  it("creates a delivery address for a physical SIM and passes it to the order", async () => {
    const steps: SubmitStep[] = [];
    await runOnboardingSubmit(
      deps(completeState({ simType: "physical", deliveryAddress: ADDRESS }), steps, []),
    );
    expect(steps).toContain("createAddress");
    expect(steps).not.toContain("requestEsim");
    expect(mockApi.createAddress).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "cust-1", address: ADDRESS }),
    );
    expect(mockApi.submitOrder).toHaveBeenCalledWith(
      expect.objectContaining({ addressId: "addr-1", simType: "physical" }),
    );
  });

  it("requests an eSIM profile for an eSIM SIM and sends simType but no address", async () => {
    const steps: SubmitStep[] = [];
    await runOnboardingSubmit(deps(completeState({ simType: "esim" }), steps, []));
    expect(steps).toContain("requestEsim");
    expect(steps).not.toContain("createAddress");
    expect(mockApi.requestEsimProfile).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "cust-1", tenantId: "drei" }),
    );
    const submitArg = mockApi.submitOrder.mock.calls[0]![0] as Record<string, unknown>;
    expect(submitArg["simType"]).toBe("esim");
    expect(submitArg["addressId"]).toBeUndefined();
  });

  it("grants the plan's data allowance after credit when a planAllowance is given", async () => {
    const steps: SubmitStep[] = [];
    const patches: Record<string, unknown>[] = [];
    await runOnboardingSubmit({
      ...deps(completeState(), steps, patches),
      planAllowance: {
        type: "data",
        offerId: "drei-up",
        offerName: "Up 10",
        amount: 10,
        unit: "GB",
      },
    });
    // Granted last, after credit, and recorded as the final step.
    expect(steps[steps.length - 1]).toBe("grantAllowance");
    expect(mockApi.grantAllowance).toHaveBeenCalledWith({
      customerId: "cust-1",
      type: "data",
      offerId: "drei-up",
      offerName: "Up 10",
      amount: 10,
      unit: "GB",
    });
    // The idempotency flag is persisted so a retry skips it.
    expect(patches).toContainEqual({ granted: true });
  });

  it("skips the allowance grant when already granted (idempotent retry)", async () => {
    const steps: SubmitStep[] = [];
    await runOnboardingSubmit({
      ...deps(completeState({ granted: true }), steps, []),
      planAllowance: { type: "data", offerId: "drei-up", amount: 10, unit: "GB" },
    });
    expect(steps).not.toContain("grantAllowance");
    expect(mockApi.grantAllowance).not.toHaveBeenCalled();
  });

  it("grants nothing when no planAllowance is given (unparseable data label)", async () => {
    const steps: SubmitStep[] = [];
    await runOnboardingSubmit(deps(completeState(), steps, []));
    expect(steps).not.toContain("grantAllowance");
    expect(mockApi.grantAllowance).not.toHaveBeenCalled();
  });

  it("throws if a physical SIM has no delivery address", async () => {
    await expect(
      runOnboardingSubmit(deps(completeState({ simType: "physical" }), [], [])),
    ).rejects.toThrow();
  });

  it("adds each selected add-on after the plan and SIM", async () => {
    await runOnboardingSubmit(
      deps(completeState({ selectedAddOnIds: ["drei-addon-1gb", "drei-addon-eu-1gb"] }), [], []),
    );
    expect(mockApi.addItem).toHaveBeenNthCalledWith(3, {
      cartId: "cart-1",
      offerId: "drei-addon-1gb",
    });
    expect(mockApi.addItem).toHaveBeenNthCalledWith(4, {
      cartId: "cart-1",
      offerId: "drei-addon-eu-1gb",
    });
    expect(mockApi.addItem).toHaveBeenCalledTimes(4);
  });

  it("should authorize plan plus extras today but credit only the plan price", async () => {
    await runOnboardingSubmit({
      ...deps(completeState({ selectedAddOnIds: ["drei-addon-1gb"] }), [], []),
      extrasMinor: 500,
    });
    expect(mockApi.authorizePayment).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinor: 1500 }),
    );
    expect(mockApi.topUp).toHaveBeenCalledWith({ customerId: "cust-1", amountMinor: 1000 });
  });

  it("should refuse a negative extras amount", async () => {
    await expect(
      runOnboardingSubmit({ ...deps(completeState(), [], []), extrasMinor: -1 }),
    ).rejects.toThrow();
    expect(mockApi.authorizePayment).not.toHaveBeenCalled();
  });

  it("reuses party, customer and contract on retry (never recreates durable resources)", async () => {
    const steps: SubmitStep[] = [];
    await runOnboardingSubmit(
      deps(
        completeState({
          authorizationRef: "auth-1",
          partyId: "p",
          customerId: "c",
          contractId: "contract-existing",
        }),
        steps,
        [],
      ),
    );
    expect(mockApi.authorizePayment).not.toHaveBeenCalled();
    expect(mockApi.createParty).not.toHaveBeenCalled();
    expect(mockApi.createCustomer).not.toHaveBeenCalled();
    expect(mockApi.createContract).not.toHaveBeenCalled();
    expect(steps).toEqual([
      "createCart",
      "addPlan",
      "addSim",
      "submitOrder",
      "recordInteraction",
      "capture",
      "credit",
    ]);
  });

  it("skips the entire cart→submit block when an orderId already exists", async () => {
    const steps: SubmitStep[] = [];
    await runOnboardingSubmit(
      deps(
        completeState({
          authorizationRef: "auth-1",
          partyId: "p",
          customerId: "c",
          contractId: "contract-existing",
          orderId: "order-existing",
        }),
        steps,
        [],
      ),
    );
    expect(mockApi.createCart).not.toHaveBeenCalled();
    expect(mockApi.addItem).not.toHaveBeenCalled();
    expect(mockApi.submitOrder).not.toHaveBeenCalled();
    // The interaction + money milestones still run (they weren't done yet).
    expect(steps).toEqual(["recordInteraction", "capture", "credit"]);
  });

  it("GOLDEN: a retry after a late failure authorizes once, submits once, credits once", async () => {
    // Attempt 1: everything succeeds UP TO credit, which fails. State is mutated via patch as we go.
    let state = completeState({ simType: "physical", deliveryAddress: ADDRESS });
    const patch = (p: Partial<OnboardingState>) => {
      state = { ...state, ...p };
    };
    mockApi.topUp.mockRejectedValueOnce(new Error("credit boom"));

    await expect(
      runOnboardingSubmit({
        state,
        patch: patch as (p: Record<string, unknown>) => void,
        onStep: () => {},
        planPriceMinor: 1000,
        methodToken: "tok-visa-4242",
      }),
    ).rejects.toThrow("credit boom");

    // Everything up to and including capture was persisted.
    expect(state.authorizationRef).toBe("auth-1");
    expect(state.customerId).toBe("cust-1");
    expect(state.addressId).toBe("addr-1");
    expect(state.orderId).toBe("order-1");
    expect(state.captured).toBe(true);
    expect(state.credited).toBe(false);

    // Attempt 2 (retry): resumes from the persisted state; only credit should run.
    const steps2: SubmitStep[] = [];
    await runOnboardingSubmit({
      state,
      patch: patch as (p: Record<string, unknown>) => void,
      onStep: (s) => steps2.push(s),
      planPriceMinor: 1000,
      methodToken: "tok-visa-4242",
    });

    // The money path ran exactly once each across BOTH attempts.
    expect(mockApi.authorizePayment).toHaveBeenCalledTimes(1);
    expect(mockApi.createParty).toHaveBeenCalledTimes(1);
    expect(mockApi.createCustomer).toHaveBeenCalledTimes(1);
    expect(mockApi.createAddress).toHaveBeenCalledTimes(1);
    expect(mockApi.submitOrder).toHaveBeenCalledTimes(1);
    expect(mockApi.createInteraction).toHaveBeenCalledTimes(1); // onboarding interaction logged once
    expect(mockApi.capturePayment).toHaveBeenCalledTimes(1);
    expect(mockApi.topUp).toHaveBeenCalledTimes(2); // attempt 1 (rejected) + attempt 2 (ok)
    // The retry only did the remaining step.
    expect(steps2).toEqual(["credit"]);
    expect(state.credited).toBe(true);
    expect(state.interactionId).toBe("pi-1");
  });

  it("persists each durable id + money milestone via patch as it happens", async () => {
    const patches: Record<string, unknown>[] = [];
    await runOnboardingSubmit(deps(completeState(), [], patches));
    expect(patches).toContainEqual({ authorizationRef: "auth-1" });
    expect(patches).toContainEqual({ partyId: "party-1" });
    expect(patches).toContainEqual({ customerId: "cust-1" });
    expect(patches).toContainEqual({ contractId: "contract-1" });
    expect(patches).toContainEqual({ orderId: "order-1" });
    expect(patches).toContainEqual({ interactionId: "pi-1" });
    expect(patches).toContainEqual({ captured: true });
    expect(patches).toContainEqual({ credited: true });
  });

  it("records the onboarding interaction with the order + MSISDN as related entities", async () => {
    await runOnboardingSubmit(deps(completeState({ reservedMsisdn: "+4368140000001" }), [], []));
    expect(mockApi.createInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "drei",
        type: "onboarding",
        status: "completed",
        relatedEntities: { orderId: "order-1", msisdn: "+4368140000001" },
      }),
    );
  });

  it("does not re-log the interaction when one already exists (idempotent)", async () => {
    const steps: SubmitStep[] = [];
    await runOnboardingSubmit(
      deps(
        completeState({
          authorizationRef: "auth-1",
          partyId: "p",
          customerId: "c",
          contractId: "contract-existing",
          orderId: "order-existing",
          interactionId: "pi-existing",
        }),
        steps,
        [],
      ),
    );
    expect(mockApi.createInteraction).not.toHaveBeenCalled();
    expect(steps).not.toContain("recordInteraction");
  });

  it("throws when called with incomplete state", async () => {
    await expect(
      runOnboardingSubmit(deps(completeState({ selectedOfferId: null }), [], [])),
    ).rejects.toThrow();
  });

  it("refuses a non-positive plan price — never authorizes a €0 activation", async () => {
    await expect(
      runOnboardingSubmit({
        state: completeState(),
        patch: () => {},
        onStep: () => {},
        planPriceMinor: 0,
        methodToken: "tok-visa-4242",
      }),
    ).rejects.toThrow();
    // Nothing was authorized — the guard runs before any seam call.
    expect(mockApi.authorizePayment).not.toHaveBeenCalled();
  });

  // The prepaid contract step (Task 3): position, idempotency, and the required-MSISDN precondition.
  describe("contract step", () => {
    it("creates the contract after the customer and before the order, keyed by the MSISDN", async () => {
      const steps: SubmitStep[] = [];
      await runOnboardingSubmit(
        deps(completeState({ reservedMsisdn: "+4368140000009" }), steps, []),
      );
      // Position: right after createCustomer, right before the order block (createCart).
      const iCustomer = steps.indexOf("createCustomer");
      const iContract = steps.indexOf("createContract");
      const iCart = steps.indexOf("createCart");
      expect(iContract).toBe(iCustomer + 1);
      expect(iContract).toBeLessThan(iCart);
      // Carries the reserved MSISDN as communicationId.
      expect(mockApi.createContract).toHaveBeenCalledWith({
        tenantId: "drei",
        customerId: "cust-1",
        communicationId: "+4368140000009",
        paymentContext: "PREPAID",
      });
    });

    it("persists contractId so a retry skips the contract step (idempotent)", async () => {
      const patches: Record<string, unknown>[] = [];
      await runOnboardingSubmit(deps(completeState(), [], patches));
      expect(patches).toContainEqual({ contractId: "contract-1" });

      // Retry with contractId already present: the step is skipped, no second contract created.
      const steps: SubmitStep[] = [];
      await runOnboardingSubmit(deps(completeState({ contractId: "contract-1" }), steps, []));
      expect(steps).not.toContain("createContract");
      expect(mockApi.createContract).toHaveBeenCalledTimes(1); // only the first run
    });

    it("fails rather than create a contract with an empty communicationId (missing MSISDN)", async () => {
      await expect(
        runOnboardingSubmit(deps(completeState({ reservedMsisdn: null }), [], [])),
      ).rejects.toThrow(/reserved MSISDN/i);
      // The contract is never created with an empty key.
      expect(mockApi.createContract).not.toHaveBeenCalled();
    });
  });
});
