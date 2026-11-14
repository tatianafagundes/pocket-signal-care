import { describe, expect, it, vi } from "vitest";

import { createChargingHttp } from "@/services/charging/charging-http";

/*
 * Contract tests for the charging http driver (recharge spec Task 4b — getBalance via the TMF654
 * bucket read). Transport = fetch-shim fixtures via an injected fetch (same approach as the CPR
 * contract tests): deterministic, no port, no env-flip.
 *
 * readBalanceByMsisdn is an internal method the recharge op uses (the bare getBalance(customerId)
 * stays notConfigured until a customer→MSISDN resolution exists), so the test reaches it via a cast.
 */

interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
}

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function recordingFetch(responses: Response[]) {
  const calls: RecordedRequest[] = [];
  let i = 0;
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const res = responses[i++];
    if (!res) throw new Error(`recordingFetch: no queued response for call ${i}`);
    return res;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

type WithBalanceRead = ReturnType<typeof createChargingHttp> & {
  readBalanceByMsisdn: (
    msisdn: string,
  ) => Promise<{ ok: boolean; data?: unknown; error?: unknown }>;
};

describe("charging-http contract — getBalance via TMF654 bucket read", () => {
  it("GETs the bucket endpoint keyed by the MSISDN, maps the amount decimal → minor", async () => {
    const bucket = [
      {
        id: "bkt-1",
        bucketType: "ProductBucketBalance",
        amount: { unit: "EUR", value: 16.01 },
        validFor: { endDateTime: "2026-12-31T23:59:59Z" },
      },
    ];
    const { fetchImpl, calls } = recordingFetch([jsonResponse(200, bucket)]);
    const driver = createChargingHttp(fetchImpl) as WithBalanceRead;

    const res = await driver.readBalanceByMsisdn("+4368140000001");

    // Same-origin recharge BFF prefix + the TMF654 bucket path + the MSISDN query, URL-encoded.
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.url).toBe(
      "/bff/recharge/bae/bssTmf654PrepayBalanceManagement/v1/bucket?communicationId=%2B4368140000001",
    );
    expect(res.ok).toBe(true);
    expect(res.data).toEqual({
      amountMinor: 1601, // 16.01 EUR → cents, no float drift
      currency: "EUR",
      validUntil: "2026-12-31T23:59:59Z",
    });
  });

  it("maps an empty bucket list to null (line never recharged)", async () => {
    const { fetchImpl } = recordingFetch([jsonResponse(200, [])]);
    const driver = createChargingHttp(fetchImpl) as WithBalanceRead;
    const res = await driver.readBalanceByMsisdn("+4368140000001");
    expect(res.ok).toBe(true);
    expect(res.data).toBeNull();
  });

  it("maps a 409 / code 33028 to a conflict SeamError (reused authorizationCode), never throws", async () => {
    const { fetchImpl } = recordingFetch([
      jsonResponse(409, { code: 33028, reason: "Conflict", message: "reused" }),
    ]);
    const driver = createChargingHttp(fetchImpl) as WithBalanceRead;
    const res = await driver.readBalanceByMsisdn("+4368140000001");
    expect(res.ok).toBe(false);
    expect((res.error as { category: string }).category).toBe("conflict");
  });

  it("a thrown fetch (network error) → unavailable, never a crash", async () => {
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const driver = createChargingHttp(fetchImpl) as WithBalanceRead;
    const res = await driver.readBalanceByMsisdn("+4368140000001");
    expect(res.ok).toBe(false);
    expect((res.error as { category: string }).category).toBe("unavailable");
  });

  it("the bare getBalance(customerId) seam stays notConfigured (no MSISDN to key the bucket)", async () => {
    const { fetchImpl } = recordingFetch([]);
    const driver = createChargingHttp(fetchImpl);
    const res = await driver.getBalance("cust-1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("charging.http.notConfigured");
  });
});
