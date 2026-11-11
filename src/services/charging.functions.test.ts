import { afterEach, describe, expect, it } from "vitest";

import { getBalance, topUp, rateAndDeduct } from "@/services/charging.functions";
import { clearForcedError } from "@/services/mock-support";

afterEach(() => clearForcedError());

describe("charging seam (mock)", () => {
  it("reads the seeded demo balance", async () => {
    const r = await getBalance("demo-drei");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).not.toBeNull();
      expect(r.data?.currency).toBe("EUR");
    }
  });

  it("returns null for a customer with no balance yet", async () => {
    const r = await getBalance("brand-new-customer");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toBeNull();
  });

  it("tops up and reflects the new balance", async () => {
    const before = await getBalance("demo-dreigo");
    const start = before.ok && before.data ? before.data.amountMinor : 0;

    const r = await topUp({ customerId: "demo-dreigo", amountMinor: 1000 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.amountMinor).toBe(start + 1000);
  });

  it("rejects a non-positive top-up (validation)", async () => {
    const r = await topUp({ customerId: "demo-drei", amountMinor: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.category).toBe("validation");
  });

  it("deducts, and refuses to go negative (insufficient balance)", async () => {
    // Fresh customer, top up a known amount, then over-deduct.
    await topUp({ customerId: "deduct-test", amountMinor: 500 });
    const okDeduct = await rateAndDeduct({ customerId: "deduct-test", amountMinor: 300 });
    expect(okDeduct.ok).toBe(true);

    const over = await rateAndDeduct({ customerId: "deduct-test", amountMinor: 9999 });
    expect(over.ok).toBe(false);
    if (!over.ok) {
      expect(over.error.code).toBe("charging.insufficientBalance");
      expect(over.error.category).toBe("rejected");
    }
    // Balance unchanged after the refused deduction.
    const after = await getBalance("deduct-test");
    if (after.ok) expect(after.data?.amountMinor).toBe(200);
  });
});
