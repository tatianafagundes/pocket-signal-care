import { describe, expect, it } from "vitest";

import { createChargingHttp, fromTmfBucket } from "@/services/charging/charging-http";

/*
 * charging-http Task 4b: the TMF654 bucket-read MAPPER is the deliverable here (the transport +
 * readBalanceByMsisdn land in Task 4 with the recharge op that uses them). Test the mapper
 * directly — decimal EUR → minor, validFor → validUntil, empty → null — and confirm the bare
 * getBalance(customerId) seam stays notConfigured (no MSISDN to key the bucket). The request/error
 * mapping is exercised by the recharge contract test in Task 4.
 */

describe("charging-http — fromTmfBucket (TMF654 bucket → Balance)", () => {
  it("maps a product bucket's decimal EUR amount to minor units + validUntil", () => {
    const balance = fromTmfBucket([
      {
        id: "bkt-1",
        bucketType: "ProductBucketBalance",
        amount: { unit: "EUR", value: 16.01 },
        validFor: { endDateTime: "2026-12-31T23:59:59Z" },
      },
    ]);
    expect(balance).toEqual({
      amountMinor: 1601, // 16.01 EUR → cents, no float drift
      currency: "EUR",
      validUntil: "2026-12-31T23:59:59Z",
    });
  });

  it("guards float rounding (e.g. 0.07 → 7 cents, not 7.0000001)", () => {
    const balance = fromTmfBucket([{ amount: { unit: "EUR", value: 0.07 } }]);
    expect(balance?.amountMinor).toBe(7);
  });

  it("maps an empty bucket list to null (line never recharged)", () => {
    expect(fromTmfBucket([])).toBeNull();
  });

  it("maps a bucket with no amount to null (nothing to show)", () => {
    expect(fromTmfBucket([{ validFor: { endDateTime: "2026-12-31T23:59:59Z" } }])).toBeNull();
  });

  it("maps a non-array (unexpected shape) to null, never throws", () => {
    expect(fromTmfBucket({})).toBeNull();
    expect(fromTmfBucket(null)).toBeNull();
  });
});

describe("charging-http — bare getBalance stays notConfigured", () => {
  it("getBalance(customerId) returns notConfigured (no MSISDN to key the TMF654 bucket)", async () => {
    const res = await createChargingHttp().getBalance("cust-1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("charging.http.notConfigured");
  });
});
