import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCprHttp } from "@/services/cpr/cpr-http";

/*
 * Contract tests for the CPR http driver (cpr-http-onboarding spec, Task 6).
 *
 * Transport = fetch-shim fixtures (decision D-contract-tests-transport = B): the test injects a
 * recording `fetch` into createCprHttp() that replays the response-shapes.md bodies and records the
 * request. Deterministic in CI, no port/child_process, no env-flip — the driver is constructed
 * directly, never selected via VITE_CPR_DRIVER (which resolves once at module load).
 *
 * These lock BOTH halves of the contract:
 *   1. request fidelity — path, method, headers (resolved X-Tenant-ID + Bearer), body shape
 *   2. response mapping — parsed domain result, and the whole error-mapping table (never throws)
 *
 * The fixture bodies mirror docs/contracts/postman/response-shapes.md + the customerview shape
 * captured from the fake. If the real cluster drifts, these fail — the point of a contract test.
 */

// --- recording fetch shim ---------------------------------------------------
interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** Build a minimal Response-like object (only what cpr-http's request() reads: ok/status/json). */
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

/**
 * A fetch shim that records each call and returns the queued response for it. Responses are queued
 * per-call in order, so a test sets exactly the response(s) its driver call(s) will receive.
 */
function recordingFetch(responses: Response[]) {
  const calls: RecordedRequest[] = [];
  let i = 0;
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers,
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    const res = responses[i++];
    if (!res) throw new Error(`recordingFetch: no queued response for call ${i}`);
    return res;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const BASE = "http://127.0.0.1:8787";

beforeEach(() => {
  vi.stubEnv("VITE_CPR_BASE_URL", BASE);
  vi.stubEnv("VITE_CPR_TOKEN", "fake-token");
  // Brand → DXP tenant resolution (drei → the placeholder); the header must carry the resolved id.
  vi.stubEnv("VITE_CPR_TENANT_DREI", "TEN_FAKE_DREI");
  vi.stubEnv("VITE_CPR_ACTIVE_BRAND", "drei");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("cpr-http contract — request fidelity + response mapping", () => {
  it("createParty: POST /customerManagement/v1/party with resolved tenant + bearer, parses .id", async () => {
    const { fetchImpl, calls } = recordingFetch([jsonResponse(201, { id: "party-xyz" })]);
    const driver = createCprHttp(fetchImpl);

    const res = await driver.createParty({
      tenantId: "drei",
      givenName: "Ada",
      familyName: "Lovelace",
      email: "ada@x.io",
    });

    // Request fidelity.
    expect(calls).toHaveLength(1);
    const req = calls[0]!;
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${BASE}/customerManagement/v1/party`);
    expect(req.headers["X-Tenant-ID"]).toBe("TEN_FAKE_DREI"); // brand → DXP tenant resolved
    expect(req.headers["Authorization"]).toBe("Bearer fake-token");
    expect(req.headers["Content-Type"]).toBe("application/json");
    // Body = the collection shape: partyNames + EmailContact contact medium.
    expect(req.body).toMatchObject({
      type: "Individual",
      partyNames: [{ givenName: "Ada", familyName: "Lovelace" }],
      contactMedia: [
        {
          contactMediumType: "EmailContact",
          contactMediumValue: [{ value: "ada@x.io", purpose: "EmailContact" }],
        },
      ],
    });
    // Response mapping.
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual({ partyId: "party-xyz" });
  });

  it("createParty: includes a PhoneContact medium when an MSISDN is given", async () => {
    const { fetchImpl, calls } = recordingFetch([jsonResponse(201, { id: "p" })]);
    const driver = createCprHttp(fetchImpl);
    await driver.createParty({
      tenantId: "drei",
      givenName: "A",
      familyName: "B",
      email: "a@b.io",
      msisdn: "+4368100000001",
    });
    const media = (calls[0]!.body as { contactMedia: unknown[] }).contactMedia;
    expect(media).toContainEqual({
      contactMediumType: "PhoneContact",
      contactMediumValue: [{ value: "+4368100000001", purpose: "Telephone" }],
    });
  });

  it("createCustomer: POST /customer with engagedPartyId, parses .id", async () => {
    const { fetchImpl, calls } = recordingFetch([jsonResponse(201, { id: "cust-xyz" })]);
    const driver = createCprHttp(fetchImpl);

    const res = await driver.createCustomer({ tenantId: "drei", partyId: "party-xyz" });

    expect(calls[0]!.url).toBe(`${BASE}/customerManagement/v1/customer`);
    expect(calls[0]!.body).toMatchObject({
      engagedPartyId: "party-xyz",
      engagedPartyType: "Individual",
      customerType: "Residential",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual({ customerId: "cust-xyz" });
  });

  it("createContract: POST /contract keyed by communicationId, parses .id", async () => {
    const { fetchImpl, calls } = recordingFetch([jsonResponse(201, { id: "contract-xyz" })]);
    const driver = createCprHttp(fetchImpl);

    const res = await driver.createContract({
      tenantId: "drei",
      customerId: "cust-xyz",
      communicationId: "+4368100000001",
      paymentContext: "PREPAID",
    });

    expect(calls[0]!.url).toBe(`${BASE}/customerManagement/v1/contract`);
    expect(calls[0]!.body).toMatchObject({
      customerId: "cust-xyz",
      communicationId: "+4368100000001",
      paymentContext: "PREPAID",
      statuses: [{ status: "ContractActive" }],
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual({ contractId: "contract-xyz" });
  });

  it("resolves X-Tenant-ID per brand: dreigo → its own DXP tenant (not a constant)", async () => {
    vi.stubEnv("VITE_CPR_TENANT_DREIGO", "TEN_FAKE_DREIGO");
    const { fetchImpl, calls } = recordingFetch([jsonResponse(201, { id: "p" })]);
    await createCprHttp(fetchImpl).createParty({
      tenantId: "dreigo",
      givenName: "A",
      familyName: "B",
      email: "a@b.io",
    });
    // Proves resolveDxpTenant is per-brand — a constant header would make drei's test pass too.
    expect(calls[0]!.headers["X-Tenant-ID"]).toBe("TEN_FAKE_DREIGO");
  });

  it("falls back to the TEN_FAKE placeholder when the brand's tenant env is unset", async () => {
    vi.stubEnv("VITE_CPR_TENANT_DREIGO", ""); // unset → placeholder
    const { fetchImpl, calls } = recordingFetch([jsonResponse(201, { id: "p" })]);
    await createCprHttp(fetchImpl).createParty({
      tenantId: "dreigo",
      givenName: "A",
      familyName: "B",
      email: "a@b.io",
    });
    expect(calls[0]!.headers["X-Tenant-ID"]).toBe("TEN_FAKE");
  });

  it("getCustomerAndParty: GET /customerview/{id}, maps to { customer, party }", async () => {
    const view = {
      id: "cust-xyz",
      statuses: [{ status: "CustomerCreated" }],
      customerType: "Residential",
      engagedParty: {
        id: "party-xyz",
        partyNames: [{ givenName: "Ada", familyName: "Lovelace" }],
        contactMedia: [
          {
            contactMediumType: "EmailContact",
            contactMediumValue: [{ value: "ada@x.io", purpose: "EmailContact" }],
          },
          {
            contactMediumType: "PhoneContact",
            contactMediumValue: [{ value: "+4368100000001", purpose: "Telephone" }],
          },
        ],
        statuses: [{ status: "PartyActive" }],
      },
    };
    const { fetchImpl, calls } = recordingFetch([jsonResponse(200, view)]);
    const driver = createCprHttp(fetchImpl);

    const res = await driver.getCustomerAndParty("cust-xyz");

    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.url).toBe(`${BASE}/customerManagement/v1/customerview/cust-xyz`);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.customer).toEqual({
        customerId: "cust-xyz",
        tenantId: "drei",
        partyId: "party-xyz",
        status: "pending", // CustomerCreated collapses to pending
        createdAt: expect.any(String),
      });
      expect(res.data.party).toEqual({
        partyId: "party-xyz",
        tenantId: "drei",
        givenName: "Ada",
        familyName: "Lovelace",
        email: "ada@x.io",
        msisdn: "+4368100000001",
      });
    }
  });

  it("getCustomerAndParty: collapses CustomerActive → active", async () => {
    const view = {
      id: "c",
      statuses: [{ status: "CustomerCreated" }, { status: "CustomerActive" }],
      engagedParty: {
        id: "p",
        partyNames: [{ givenName: "A", familyName: "B" }],
        contactMedia: [
          {
            contactMediumType: "EmailContact",
            contactMediumValue: [{ value: "a@b.io", purpose: "EmailContact" }],
          },
        ],
      },
    };
    const { fetchImpl } = recordingFetch([jsonResponse(200, view)]);
    const res = await createCprHttp(fetchImpl).getCustomerAndParty("c");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.customer.status).toBe("active");
  });
});

describe("cpr-http contract — error mapping table (never throws)", () => {
  // Each case: an HTTP status + the { code, reason, message } envelope → a SeamError category.
  const cases: { name: string; status: number; code?: number; category: string }[] = [
    { name: "404 → notFound", status: 404, code: 4044, category: "notFound" },
    { name: "409 → conflict", status: 409, category: "conflict" },
    {
      name: "body code 4041 (duplicate) → conflict",
      status: 400,
      code: 4041,
      category: "conflict",
    },
    { name: "4040 party-not-active → rejected", status: 400, code: 4040, category: "rejected" },
    { name: "5031 inactivation blocked → rejected", status: 400, code: 5031, category: "rejected" },
    { name: "5032 inactivation blocked → rejected", status: 400, code: 5032, category: "rejected" },
    { name: "other 4xx → rejected", status: 422, code: 4099, category: "rejected" },
    { name: "5xx → unavailable", status: 503, code: 5000, category: "unavailable" },
  ];

  for (const c of cases) {
    it(c.name, async () => {
      const body = { code: c.code, reason: "Err", message: "something" };
      const { fetchImpl } = recordingFetch([jsonResponse(c.status, body)]);
      const res = await createCprHttp(fetchImpl).createParty({
        tenantId: "drei",
        givenName: "A",
        familyName: "B",
        email: "a@b.io",
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.category).toBe(c.category);
    });
  }

  it("missing id in a 2xx body → badResponse (unknown), not a throw", async () => {
    const { fetchImpl } = recordingFetch([jsonResponse(201, { notAnId: true })]);
    const res = await createCprHttp(fetchImpl).createParty({
      tenantId: "drei",
      givenName: "A",
      familyName: "B",
      email: "a@b.io",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("cpr.http.badResponse");
      expect(res.error.category).toBe("unknown");
    }
  });

  it("non-JSON error body (.json() throws) → mapped by status alone (5xx → unavailable)", async () => {
    // Exercises request()'s inner try/catch that keeps an empty envelope when the error body
    // isn't JSON; mapHttpError then falls back to the HTTP status.
    const badBody = {
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response;
    const { fetchImpl } = recordingFetch([badBody]);
    const res = await createCprHttp(fetchImpl).createParty({
      tenantId: "drei",
      givenName: "A",
      familyName: "B",
      email: "a@b.io",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.category).toBe("unavailable");
  });

  it("a thrown fetch (network error) → unavailable, never a crash", async () => {
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const res = await createCprHttp(fetchImpl).createParty({
      tenantId: "drei",
      givenName: "A",
      familyName: "B",
      email: "a@b.io",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.category).toBe("unavailable");
  });

  it("not configured (no base URL / token) → notConfigured, no fetch call", async () => {
    vi.stubEnv("VITE_CPR_BASE_URL", "");
    vi.stubEnv("VITE_CPR_TOKEN", "");
    const { fetchImpl, calls } = recordingFetch([]);
    const res = await createCprHttp(fetchImpl).createParty({
      tenantId: "drei",
      givenName: "A",
      familyName: "B",
      email: "a@b.io",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("cpr.http.notConfigured");
    expect(calls).toHaveLength(0); // never reached fetch
  });
});
