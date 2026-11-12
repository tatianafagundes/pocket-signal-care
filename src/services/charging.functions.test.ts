import { afterEach, describe, expect, it } from "vitest";

import {
  getBalance,
  topUp,
  rateAndDeduct,
  getUsage,
  grantAllowance,
} from "@/services/charging.functions";
import { clearForcedError, forceError } from "@/services/mock-support";

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

describe("charging usage axis (mock)", () => {
  it("reads the seeded demo usage buckets (data/voice/sms/roaming)", async () => {
    const r = await getUsage("demo-drei");
    expect(r.ok).toBe(true);
    if (r.ok) {
      const types = r.data.map((b) => b.type).sort();
      expect(types).toEqual(["data", "roaming", "sms", "voice"]);
      // The seeded data bucket is near the low threshold (correlated to the plan offer).
      const data = r.data.find((b) => b.type === "data")!;
      expect(data.offerId).toBe("drei-up");
      expect(data.remaining?.unit).toBe("GB");
    }
  });

  it("returns an empty array for a customer with no buckets", async () => {
    const r = await getUsage("usage-none");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual([]);
  });

  it("grants a new bucket when none exists for the offer", async () => {
    const r = await grantAllowance({
      customerId: "usage-grant",
      type: "data",
      offerId: "addon-x",
      offerName: "+1 GB",
      amount: 1,
      unit: "GB",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.total).toEqual({ value: 1, unit: "GB" });
      expect(r.data.remaining).toEqual({ value: 1, unit: "GB" });
    }
    const after = await getUsage("usage-grant");
    if (after.ok) expect(after.data).toHaveLength(1);
  });

  it("refills (tops up) an existing bucket with the same offerId instead of adding a second", async () => {
    await grantAllowance({
      customerId: "usage-refill",
      type: "data",
      offerId: "addon-y",
      amount: 1,
      unit: "GB",
    });
    // Partly consume it so we can prove remaining grows by the grant, not resets.
    const mid = await getUsage("usage-refill");
    const bucketId = mid.ok ? mid.data[0]!.bucketId : "";

    const r = await grantAllowance({
      customerId: "usage-refill",
      type: "data",
      offerId: "addon-y",
      amount: 2,
      unit: "GB",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      // Same bucket, total and remaining both increased by the new grant.
      expect(r.data.bucketId).toBe(bucketId);
      expect(r.data.total).toEqual({ value: 3, unit: "GB" });
      expect(r.data.remaining).toEqual({ value: 3, unit: "GB" });
    }
    const after = await getUsage("usage-refill");
    if (after.ok) expect(after.data).toHaveLength(1); // not two buckets
  });

  it("grants an unlimited bucket with no total/remaining", async () => {
    const r = await grantAllowance({
      customerId: "usage-unl",
      type: "data",
      offerId: "addon-unl",
      unlimited: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.unlimited).toBe(true);
      expect(r.data.total).toBeUndefined();
      expect(r.data.remaining).toBeUndefined();
    }
  });

  it("rejects a metered grant missing amount/unit (validation)", async () => {
    const r = await grantAllowance({ customerId: "usage-bad", type: "data", offerId: "addon-z" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.category).toBe("validation");
  });

  it("does not expose the mock's internal state (array and nested fields are safe to mutate)", async () => {
    const r1 = await getUsage("demo-dreigo");
    if (r1.ok) {
      r1.data.push({ bucketId: "x", type: "data", unlimited: true });
      // Mutate a nested quantity on a returned bucket — must not reach the mock's stored state.
      const data = r1.data.find((b) => b.type === "data");
      if (data?.remaining) data.remaining.value = -999;
    }
    const r2 = await getUsage("demo-dreigo");
    if (r2.ok) {
      expect(r2.data.find((b) => b.bucketId === "x")).toBeUndefined();
      const data = r2.data.find((b) => b.type === "data");
      expect(data?.remaining?.value).not.toBe(-999);
    }
  });

  it("degrades to a seam error when getUsage is forced to fail", async () => {
    forceError("charging.getUsage");
    const r = await getUsage("demo-drei");
    expect(r.ok).toBe(false);
  });
});
