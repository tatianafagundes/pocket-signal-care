import { runTopUp } from "@/lib/topup-payment";
import { emptyTopUpProgress, type TopUpProgress } from "@/lib/topup-progress";

// Mock the api seam surface runTopUp calls. SeamFailure is provided (runTopUp throws one on the
// http path when the contract/MSISDN is missing), mirroring the real class shape.
vi.mock("@/services/api", () => ({
  SeamFailure: class SeamFailure extends Error {
    code: string;
    category: string;
    retryable: boolean;
    customerKey: string;
    constructor(e: {
      code: string;
      category: string;
      retryable: boolean;
      customerFacing?: { key?: string };
    }) {
      super(e.code);
      this.name = "SeamFailure";
      this.code = e.code;
      this.category = e.category;
      this.retryable = e.retryable;
      this.customerKey = e.customerFacing?.key ?? e.code;
    }
  },
  api: {
    recharge: vi.fn(async () => ({
      partyInteractionId: "pin-9",
      balance: { amountMinor: 3240, currency: "EUR" as const },
    })),
    authorizePayment: vi.fn(async () => ({
      authorizationRef: "auth-1",
      amountMinor: 2000,
      currency: "EUR" as const,
      status: "authorized" as const,
    })),
    capturePayment: vi.fn(async () => ({
      authorizationRef: "auth-1",
      amountMinor: 2000,
      currency: "EUR" as const,
      status: "captured" as const,
    })),
    topUp: vi.fn(async () => ({
      amountMinor: 3240,
      currency: "EUR" as const,
      validUntil: "2026-12-15T00:00:00Z",
    })),
    getBalance: vi.fn(async () => ({
      amountMinor: 3240,
      currency: "EUR" as const,
      validUntil: "2026-12-15T00:00:00Z",
    })),
  },
}));

import { api } from "@/services/api";

const mockApi = api as unknown as Record<
  "authorizePayment" | "capturePayment" | "topUp" | "getBalance" | "recharge",
  ReturnType<typeof vi.fn>
>;

/** A patch that records every persisted progress snapshot (the sessionStorage write in prod). */
function recordingPatch() {
  const snapshots: TopUpProgress[] = [];
  const patch = (next: TopUpProgress) => snapshots.push({ ...next });
  return { snapshots, patch };
}

beforeEach(() => {
  for (const fn of Object.values(mockApi)) fn.mockClear();
});

describe("runTopUp — three money moments, idempotent", () => {
  it("happy path: authorize → capture → credit, each once, returns the new balance", async () => {
    const { patch } = recordingPatch();
    const result = await runTopUp({
      customerId: "cust-1",
      amountMinor: 2000,
      methodToken: "tok-visa-4242",
      progress: emptyTopUpProgress(),
      patch,
    });

    expect(mockApi.authorizePayment).toHaveBeenCalledTimes(1);
    expect(mockApi.capturePayment).toHaveBeenCalledTimes(1);
    expect(mockApi.topUp).toHaveBeenCalledTimes(1);
    expect(mockApi.getBalance).not.toHaveBeenCalled();
    expect(result.balance.amountMinor).toBe(3240);
    expect(result.balance.validUntil).toBe("2026-12-15T00:00:00Z");
    expect(result.authorizationRef).toBe("auth-1");
  });

  it("GOLDEN: a retry after the credit fails authorizes once, captures once, credits once", async () => {
    // Attempt 1: topUp (credit) rejects once. authorize + capture succeed and persist.
    mockApi.topUp.mockRejectedValueOnce(new Error("ecev down"));
    const { snapshots, patch } = recordingPatch();
    let progress = emptyTopUpProgress();
    const apply = (next: TopUpProgress) => {
      progress = next;
      patch(next);
    };

    await expect(
      runTopUp({ customerId: "c", amountMinor: 2000, methodToken: "tok", progress, patch: apply }),
    ).rejects.toThrow("ecev down");

    // After attempt 1: authorized + captured persisted, NOT credited.
    expect(progress.authorizationRef).toBe("auth-1");
    expect(progress.captured).toBe(true);
    expect(progress.credited).toBe(false);

    // Attempt 2: resume with the persisted progress. Only credit should run again.
    await runTopUp({
      customerId: "c",
      amountMinor: 2000,
      methodToken: "tok",
      progress,
      patch: apply,
    });

    expect(mockApi.authorizePayment).toHaveBeenCalledTimes(1); // NOT re-authorized
    expect(mockApi.capturePayment).toHaveBeenCalledTimes(1); // NOT re-captured
    expect(mockApi.topUp).toHaveBeenCalledTimes(2); // reject + ok
    expect(progress.credited).toBe(true);
    // The final persisted snapshot is fully done.
    expect(snapshots.at(-1)).toMatchObject({ captured: true, credited: true });
  });

  it("resume after credit never re-credits — reads the current balance instead", async () => {
    const already: TopUpProgress = { authorizationRef: "auth-1", captured: true, credited: true };
    const { patch } = recordingPatch();
    const result = await runTopUp({
      customerId: "cust-1",
      amountMinor: 2000,
      methodToken: "tok",
      progress: already,
      patch,
    });

    expect(mockApi.authorizePayment).not.toHaveBeenCalled();
    expect(mockApi.capturePayment).not.toHaveBeenCalled();
    expect(mockApi.topUp).not.toHaveBeenCalled(); // never credit twice
    expect(mockApi.getBalance).toHaveBeenCalledTimes(1);
    expect(result.balance.amountMinor).toBe(3240);
    expect(result.authorizationRef).toBe("auth-1");
  });

  it("rejects a non-positive amount before any seam call (money boundary)", async () => {
    const { patch } = recordingPatch();
    await expect(
      runTopUp({
        customerId: "c",
        amountMinor: 0,
        methodToken: "tok",
        progress: emptyTopUpProgress(),
        patch,
      }),
    ).rejects.toThrow(/positive integer/);
    expect(mockApi.authorizePayment).not.toHaveBeenCalled();
  });

  describe("http path (recharge Task 3)", () => {
    beforeEach(() => vi.stubEnv("VITE_ECEV_DRIVER", "http"));
    afterEach(() => vi.unstubAllEnvs());

    it("credits via api.recharge (one call), NOT authorize/capture/topUp", async () => {
      const result = await runTopUp({
        customerId: "cust-1",
        amountMinor: 2000,
        methodToken: "tok",
        progress: emptyTopUpProgress(),
        patch: () => {},
        contractId: "contract-7",
        communicationId: "+4368140000001",
      });
      expect(mockApi.recharge).toHaveBeenCalledWith({
        customerId: "cust-1",
        contractId: "contract-7",
        communicationId: "+4368140000001",
        amountMinor: 2000,
        methodToken: "tok",
      });
      expect(mockApi.authorizePayment).not.toHaveBeenCalled();
      expect(mockApi.capturePayment).not.toHaveBeenCalled();
      expect(mockApi.topUp).not.toHaveBeenCalled();
      // partyInteractionId stands in as the receipt's transaction reference.
      expect(result.authorizationRef).toBe("pin-9");
      expect(result.balance.amountMinor).toBe(3240);
    });

    it("fails with a SeamFailure when the contract id / MSISDN is missing (can't key a recharge)", async () => {
      await expect(
        runTopUp({
          customerId: "cust-1",
          amountMinor: 2000,
          methodToken: "tok",
          progress: emptyTopUpProgress(),
          patch: () => {},
          contractId: null,
          communicationId: null,
        }),
      ).rejects.toMatchObject({ name: "SeamFailure", code: "charging.recharge.noContract" });
      expect(mockApi.recharge).not.toHaveBeenCalled();
    });
  });
});
