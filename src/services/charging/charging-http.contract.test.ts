import { describe, expect, it } from "vitest";

import { createChargingHttp, fromTmfBucket } from "@/services/charging/charging-http";

/* A recording fetch that returns queued responses in order. */
interface Rec {
  url: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
}
function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}
function recordingFetch(responses: Response[]) {
  const calls: Rec[] = [];
  let i = 0;
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(init.body as string) : undefined,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const res = responses[i++];
    if (!res) throw new Error(`recordingFetch: no queued response for call ${i}`);
    return res;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const INPUT = {
  customerId: "cust-1",
  contractId: "ct-1",
  communicationId: "+4368140000001",
  amountMinor: 1101,
  methodToken: "tok-visa-4242",
};

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

describe("charging-http — recharge (payment direct-capture → monetaryRecharge → bucket)", () => {
  it("runs payment → journey → bucket read, mapping money minor↔decimal and threading refs", async () => {
    const { fetchImpl, calls } = recordingFetch([
      jsonResponse(201, { id: "pay-9", authorizationCode: "AUTH-9", status: "SUCCESS" }),
      jsonResponse(200, { partyInteractionId: "PIN-9" }),
      jsonResponse(200, [
        {
          amount: { unit: "EUR", value: 11.01 },
          validFor: { endDateTime: "2026-12-31T23:59:59Z" },
        },
      ]),
    ]);
    const res = await createChargingHttp(fetchImpl).recharge(INPUT);

    // Three calls in order, all same-origin /bff/recharge.
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST /bff/recharge/payment/v4/payment",
      "POST /bff/recharge/xCACcore/v1/customerInteraction",
      "GET /bff/recharge/bae/bssTmf654PrepayBalanceManagement/v1/bucket?communicationId=%2B4368140000001",
    ]);
    // Payment body: MSISDN account, customerId payer, decimal EUR amount, cash method; NO methodToken.
    expect(calls[0]!.body).toMatchObject({
      account: { id: "+4368140000001" },
      payer: { id: "cust-1" },
      amount: { unit: "EUR", value: 11.01 },
      paymentMethod: { "@type": "cash" },
    });
    expect(JSON.stringify(calls[0]!.body)).not.toContain("tok-visa-4242"); // methodToken never on the wire
    // Journey body threads the payment refs + contract.
    expect(calls[1]!.body).toMatchObject({
      customerId: "cust-1",
      contractId: "ct-1",
      journeyId: "monetaryRecharge",
      journeyData: {
        msisdn: "+4368140000001",
        payment: { merchantRefNum: "pay-9", paymentGwTransactionId: "AUTH-9" },
      },
    });
    // Result: the journey's partyInteractionId + the bucket-read balance.
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.partyInteractionId).toBe("PIN-9");
      expect(res.data.balance).toEqual({
        amountMinor: 1101,
        currency: "EUR",
        validUntil: "2026-12-31T23:59:59Z",
      });
    }
  });

  it("sends the non-secret X-App-Brand header (and NO Authorization) on every BFF call (F1)", async () => {
    // The BFF resolves X-App-Brand → the DXP X-Tenant-ID. Without this header the BFF would fall
    // back to the TEN_FAKE placeholder — invisible against the fake, wrong against real DXP. The
    // token stays server-side: the client must never send Authorization.
    const { fetchImpl, calls } = recordingFetch([
      jsonResponse(201, { id: "pay-1", authorizationCode: "A1", status: "SUCCESS" }),
      jsonResponse(200, { partyInteractionId: "PIN-1" }),
      jsonResponse(200, []),
    ]);
    await createChargingHttp(fetchImpl).recharge(INPUT);
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call.headers["X-App-Brand"]).toBe("drei"); // DEFAULT_TENANT (no VITE_CPR_ACTIVE_BRAND set)
      expect(call.headers["Authorization"]).toBeUndefined(); // token is injected by the BFF, never here
    }
  });

  it("a reused-authorizationCode payment (409/33028) → conflict, journey NOT attempted", async () => {
    const { fetchImpl, calls } = recordingFetch([
      jsonResponse(409, { code: 33028, reason: "Conflict", message: "reused" }),
    ]);
    const res = await createChargingHttp(fetchImpl).recharge(INPUT);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.category).toBe("conflict");
    expect(calls).toHaveLength(1); // stopped at payment; the journey never ran (no double-apply)
  });

  it("payment succeeds but the journey fails → error surfaces, bucket NOT read (paid-but-not-credited)", async () => {
    // The non-transactional reality: the payment captured, the journey failed. The error propagates
    // (the user sees failure) and we do NOT read a balance for a recharge that did not complete.
    // The orphan charge is the recorded cross-step-compensation / idempotency debt.
    const { fetchImpl, calls } = recordingFetch([
      jsonResponse(201, { id: "pay-9", authorizationCode: "AUTH-9" }),
      jsonResponse(503, { code: 5000, reason: "Unavailable", message: "journey svc down" }),
    ]);
    const res = await createChargingHttp(fetchImpl).recharge(INPUT);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.category).toBe("unavailable");
    expect(calls).toHaveLength(2); // payment + journey; the bucket read never ran
  });

  it("a failed bucket read after a successful journey → balance null (runTopUp falls back)", async () => {
    const { fetchImpl } = recordingFetch([
      jsonResponse(201, { id: "pay-9", authorizationCode: "AUTH-9" }),
      jsonResponse(200, { partyInteractionId: "PIN-9" }),
      jsonResponse(503, { code: 5000, reason: "Unavailable", message: "balance svc down" }),
    ]);
    const res = await createChargingHttp(fetchImpl).recharge(INPUT);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.partyInteractionId).toBe("PIN-9"); // the recharge still succeeded
      expect(res.data.balance).toBeNull(); // balance unavailable → null
    }
  });

  it("a payment response missing the id → badResponse, journey NOT attempted", async () => {
    const { fetchImpl, calls } = recordingFetch([jsonResponse(201, { status: "SUCCESS" })]);
    const res = await createChargingHttp(fetchImpl).recharge(INPUT);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("charging.http.badResponse");
    expect(calls).toHaveLength(1);
  });

  it("a thrown fetch (network) → unavailable, never a crash", async () => {
    const fetchImpl = (async () => {
      throw new Error("down");
    }) as unknown as typeof fetch;
    const res = await createChargingHttp(fetchImpl).recharge(INPUT);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.category).toBe("unavailable");
  });
});
