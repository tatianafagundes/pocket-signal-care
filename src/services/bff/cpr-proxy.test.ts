import { describe, expect, it, vi } from "vitest";

import { handleBffCpr, type BffCprDeps } from "@/services/bff/cpr-proxy";

/*
 * BFF CPR proxy unit tests (Task 1.5). Inject a stubbed upstream fetch + config — no network, no
 * Worker runtime. Assert: the allowlist (forward vs 404), the server-side token + tenant injection,
 * the unconfigured-token envelope, and the upstream-unreachable envelope. The token is NEVER
 * expected in the client-facing contract — here we assert it IS added to the UPSTREAM request only.
 */

function okUpstream(body: unknown, status = 201) {
  return {
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

function deps(over: Partial<BffCprDeps> = {}): BffCprDeps {
  return {
    config: { baseUrl: "https://cpr.internal", token: "server-secret-token" },
    resolveTenant: (brand) => (brand === "dreigo" ? "TEN_DREIGO" : "TEN_DREI"),
    fetchUpstream: vi.fn(async () => okUpstream({ id: "party-1" })),
    ...over,
  };
}

function req(method: string, subPath: string, opts: { brand?: string; body?: string } = {}) {
  return new Request(`https://app.example/bff/cpr/${subPath}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(opts.brand ? { "X-App-Brand": opts.brand } : {}),
    },
    ...(opts.body ? { body: opts.body } : {}),
  });
}

describe("BFF CPR proxy — forwarding + token/tenant injection", () => {
  it("forwards an allowlisted POST /party, injecting Bearer token + resolved X-Tenant-ID upstream", async () => {
    const d = deps();
    const res = await handleBffCpr(
      req("POST", "party", { brand: "drei", body: '{"type":"Individual"}' }),
      d,
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "party-1" });

    // The upstream call carried the SERVER token + tenant — never exposed to the client.
    const fetchMock = d.fetchUpstream as unknown as ReturnType<typeof vi.fn>;
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://cpr.internal/customerManagement/v1/party");
    expect(init.method).toBe("POST");
    expect(init.headers["Authorization"]).toBe("Bearer server-secret-token");
    expect(init.headers["X-Tenant-ID"]).toBe("TEN_DREI");
    expect(init.body).toBe('{"type":"Individual"}');
  });

  it("does NOT let the client forge the security headers (Authorization / X-Tenant-ID)", async () => {
    // A malicious client sends its own Authorization + X-Tenant-ID. The BFF must ignore them and
    // use ONLY the server token + the brand-resolved tenant — the invariant that the client never
    // controls the security headers. (Guards against a future refactor that spreads request.headers.)
    const d = deps();
    const forged = new Request("https://app.example/bff/cpr/party", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-App-Brand": "drei",
        Authorization: "Bearer FORGED-client-token",
        "X-Tenant-ID": "TEN_SOMEONE_ELSE",
      },
      body: "{}",
    });
    await handleBffCpr(forged, d);
    const init = (d.fetchUpstream as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(init.headers["Authorization"]).toBe("Bearer server-secret-token"); // server token, not forged
    expect(init.headers["X-Tenant-ID"]).toBe("TEN_DREI"); // brand-resolved, not the forged tenant
  });

  it("preserves an empty upstream body (204) as empty — no JSON content-type, no badResponse", async () => {
    const d = deps({
      fetchUpstream: vi.fn(async () => ({ status: 204, text: async () => "" }) as Response),
    });
    const res = await handleBffCpr(req("POST", "contract", { brand: "drei", body: "{}" }), d);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    // No JSON content-type forced on an empty body, so the driver won't res.json("").
    expect(res.headers.get("content-type") ?? "").not.toContain("application/json");
  });

  it("resolves the tenant per brand (dreigo → its own DXP tenant)", async () => {
    const d = deps();
    await handleBffCpr(req("POST", "customer", { brand: "dreigo", body: "{}" }), d);
    const fetchMock = d.fetchUpstream as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls[0]![1].headers["X-Tenant-ID"]).toBe("TEN_DREIGO");
  });

  it("forwards an allowlisted GET /customerview/{id} without a body", async () => {
    const d = deps({ fetchUpstream: vi.fn(async () => okUpstream({ id: "c1" }, 200)) });
    const res = await handleBffCpr(req("GET", "customerview/cust-1", { brand: "drei" }), d);
    expect(res.status).toBe(200);
    const fetchMock = d.fetchUpstream as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://cpr.internal/customerManagement/v1/customerview/cust-1",
    );
    expect(fetchMock.mock.calls[0]![1].body).toBeUndefined(); // no body on GET
  });

  it("passes the upstream status + body through unchanged (e.g. a 404 envelope)", async () => {
    const d = deps({
      fetchUpstream: vi.fn(async () =>
        okUpstream({ code: 4044, reason: "Not Found", message: "Customer not found" }, 404),
      ),
    });
    const res = await handleBffCpr(req("POST", "contract", { brand: "drei", body: "{}" }), d);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 4044 });
  });
});

describe("BFF CPR proxy — allowlist + failure envelopes (not an open relay)", () => {
  it("404s a path that is not on the allowlist", async () => {
    const d = deps();
    const res = await handleBffCpr(
      req("POST", "admin/resetEverything", { brand: "drei", body: "{}" }),
      d,
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 40400 });
    expect((d.fetchUpstream as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("404s an allowlisted path with the wrong method (POST-only path via GET)", async () => {
    const d = deps();
    const res = await handleBffCpr(req("GET", "party", { brand: "drei" }), d);
    expect(res.status).toBe(404);
    expect((d.fetchUpstream as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("returns a 503 envelope when the server token/base URL is not configured (no upstream call)", async () => {
    const d = deps({ config: { baseUrl: null, token: null } });
    const res = await handleBffCpr(req("POST", "party", { brand: "drei", body: "{}" }), d);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 5030 });
    expect((d.fetchUpstream as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("returns a 503 envelope when the upstream fetch throws (unreachable), never leaks the error", async () => {
    const d = deps({
      fetchUpstream: vi.fn(async () => {
        throw new Error("ECONNREFUSED to the cluster");
      }),
    });
    const res = await handleBffCpr(req("POST", "party", { brand: "drei", body: "{}" }), d);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toMatchObject({ code: 5031 });
    expect(JSON.stringify(body)).not.toContain("ECONNREFUSED"); // error not leaked
  });
});
