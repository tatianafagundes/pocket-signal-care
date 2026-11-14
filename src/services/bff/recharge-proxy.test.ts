import { describe, expect, it, vi } from "vitest";

import { handleBffRecharge, type BffRechargeDeps } from "@/services/bff/recharge-proxy";

/*
 * BFF recharge proxy unit tests (cpr-recharge Task 5). Inject a stubbed upstream fetch + config —
 * no network, no Worker runtime. Assert: the three-path allowlist (payment / journey / bucket, and
 * 404 for anything else), the server-side token + tenant injection, the forged-header guard, the
 * query-string passthrough for the bucket read, and the unconfigured / unreachable 503 envelopes.
 * The token is NEVER in the client-facing contract — we assert it is added to the UPSTREAM request.
 */

function okUpstream(body: unknown, status = 201) {
  return {
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

function deps(over: Partial<BffRechargeDeps> = {}): BffRechargeDeps {
  return {
    config: { baseUrl: "https://charging.internal", token: "server-recharge-token" },
    resolveTenant: (brand) => (brand === "dreigo" ? "TEN_DREIGO" : "TEN_DREI"),
    fetchUpstream: vi.fn(async () => okUpstream({ id: "pay-fake-1" })),
    ...over,
  };
}

function req(method: string, subPath: string, opts: { brand?: string; body?: string } = {}) {
  return new Request(`https://app.example/bff/recharge/${subPath}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(opts.brand ? { "X-App-Brand": opts.brand } : {}),
    },
    ...(opts.body ? { body: opts.body } : {}),
  });
}

describe("BFF recharge proxy — forwarding + token/tenant injection", () => {
  it("forwards POST /payment/v4/payment, injecting Bearer token + resolved X-Tenant-ID upstream", async () => {
    const d = deps();
    const res = await handleBffRecharge(
      req("POST", "payment/v4/payment", {
        brand: "drei",
        body: '{"authorizationCode":"Payer-AuthCode_x"}',
      }),
      d,
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "pay-fake-1" });

    const fetchMock = d.fetchUpstream as unknown as ReturnType<typeof vi.fn>;
    const [url, init] = fetchMock.mock.calls[0]!;
    // Full sub-path forwarded verbatim — no single resource-root prefix prepended.
    expect(url).toBe("https://charging.internal/payment/v4/payment");
    expect(init.method).toBe("POST");
    expect(init.headers["Authorization"]).toBe("Bearer server-recharge-token");
    expect(init.headers["X-Tenant-ID"]).toBe("TEN_DREI");
    expect(init.body).toBe('{"authorizationCode":"Payer-AuthCode_x"}');
  });

  it("forwards POST /xCACcore/v1/customerInteraction (the monetaryRecharge journey)", async () => {
    const d = deps({
      fetchUpstream: vi.fn(async () => okUpstream({ partyInteractionId: "PIN-1" }, 200)),
    });
    const res = await handleBffRecharge(
      req("POST", "xCACcore/v1/customerInteraction", { brand: "drei", body: "{}" }),
      d,
    );
    expect(res.status).toBe(200);
    const fetchMock = d.fetchUpstream as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://charging.internal/xCACcore/v1/customerInteraction",
    );
  });

  it("forwards GET bucket WITH its ?communicationId= query string, no body", async () => {
    const d = deps({
      fetchUpstream: vi.fn(async () => okUpstream([{ amount: { unit: "EUR", value: 10 } }], 200)),
    });
    const res = await handleBffRecharge(
      req("GET", "bae/bssTmf654PrepayBalanceManagement/v1/bucket?communicationId=%2B4367712345", {
        brand: "drei",
      }),
      d,
    );
    expect(res.status).toBe(200);
    const fetchMock = d.fetchUpstream as unknown as ReturnType<typeof vi.fn>;
    const [url, init] = fetchMock.mock.calls[0]!;
    // Query string reaches upstream — the bucket read needs the MSISDN to key the balance.
    expect(url).toBe(
      "https://charging.internal/bae/bssTmf654PrepayBalanceManagement/v1/bucket?communicationId=%2B4367712345",
    );
    expect(init.body).toBeUndefined(); // no body on GET
  });

  it("does NOT let the client forge the security headers (Authorization / X-Tenant-ID)", async () => {
    // A malicious client sends its own Authorization + X-Tenant-ID. The BFF must ignore them and
    // use ONLY the server token + the brand-resolved tenant. (Guards against a future refactor that
    // spreads request.headers into the upstream init — the I2 invariant.)
    const d = deps();
    const forged = new Request("https://app.example/bff/recharge/payment/v4/payment", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-App-Brand": "drei",
        Authorization: "Bearer FORGED-client-token",
        "X-Tenant-ID": "TEN_SOMEONE_ELSE",
      },
      body: "{}",
    });
    await handleBffRecharge(forged, d);
    const init = (d.fetchUpstream as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(init.headers["Authorization"]).toBe("Bearer server-recharge-token"); // server token, not forged
    expect(init.headers["X-Tenant-ID"]).toBe("TEN_DREI"); // brand-resolved, not the forged tenant
  });

  it("resolves the tenant per brand (dreigo → its own DXP tenant)", async () => {
    const d = deps();
    await handleBffRecharge(req("POST", "payment/v4/payment", { brand: "dreigo", body: "{}" }), d);
    const fetchMock = d.fetchUpstream as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls[0]![1].headers["X-Tenant-ID"]).toBe("TEN_DREIGO");
  });

  it("passes the upstream status + body through unchanged (e.g. the 33028 conflict envelope)", async () => {
    const d = deps({
      fetchUpstream: vi.fn(async () =>
        okUpstream(
          { code: 33028, reason: "Conflict", message: "authorizationCode already used" },
          409,
        ),
      ),
    });
    const res = await handleBffRecharge(
      req("POST", "payment/v4/payment", { brand: "drei", body: "{}" }),
      d,
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 33028 });
  });

  it("preserves an empty upstream body (204) as empty — no JSON content-type, no badResponse", async () => {
    const d = deps({
      fetchUpstream: vi.fn(async () => ({ status: 204, text: async () => "" }) as Response),
    });
    const res = await handleBffRecharge(
      req("POST", "xCACcore/v1/customerInteraction", { brand: "drei", body: "{}" }),
      d,
    );
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(res.headers.get("content-type") ?? "").not.toContain("application/json");
  });
});

describe("BFF recharge proxy — allowlist + failure envelopes (not an open relay)", () => {
  it("404s a path that is not on the allowlist (no upstream call)", async () => {
    const d = deps();
    const res = await handleBffRecharge(
      req("POST", "payment/v4/refund", { brand: "drei", body: "{}" }),
      d,
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 40400 });
    expect((d.fetchUpstream as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("404s an allowlisted path with the wrong method (bucket is GET-only, tried via POST)", async () => {
    const d = deps();
    const res = await handleBffRecharge(
      req("POST", "bae/bssTmf654PrepayBalanceManagement/v1/bucket", { brand: "drei", body: "{}" }),
      d,
    );
    expect(res.status).toBe(404);
    expect((d.fetchUpstream as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("404s the payment path tried via GET (POST-only)", async () => {
    const d = deps();
    const res = await handleBffRecharge(req("GET", "payment/v4/payment", { brand: "drei" }), d);
    expect(res.status).toBe(404);
    expect((d.fetchUpstream as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("returns a 503 envelope when the server token/base URL is not configured (no upstream call)", async () => {
    const d = deps({ config: { baseUrl: null, token: null } });
    const res = await handleBffRecharge(
      req("POST", "payment/v4/payment", { brand: "drei", body: "{}" }),
      d,
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 5030 });
    expect((d.fetchUpstream as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("returns a 503 envelope when the upstream fetch throws (unreachable), never leaks the error", async () => {
    const d = deps({
      fetchUpstream: vi.fn(async () => {
        throw new Error("ECONNREFUSED to the charging cluster");
      }),
    });
    const res = await handleBffRecharge(
      req("POST", "payment/v4/payment", { brand: "drei", body: "{}" }),
      d,
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toMatchObject({ code: 5031 });
    expect(JSON.stringify(body)).not.toContain("ECONNREFUSED"); // error not leaked
  });
});
