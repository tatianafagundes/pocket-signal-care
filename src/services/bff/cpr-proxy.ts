/*
 * CPR BFF proxy handler. (cpr-bff-auth Task 1)
 *
 * The server-side half of the CPR http path: the client calls same-origin `/bff/cpr/<cpr-path>`
 * with NO token; this injects the server-held token + the resolved X-Tenant-ID and forwards to the
 * real CPR. The browser never sees the token.
 *
 * Written as a pure-ish function with injected deps (config, tenant resolver, upstream fetch) so it
 * is unit-testable without the Worker runtime. The route file (bff.cpr.$.tsx) wires the real deps.
 *
 * SECURITY: never logs request bodies (PII). Never echoes env. Only an allowlist of CPR paths is
 * forwarded — this is not an open relay.
 */

import type { BffCprConfig } from "@/services/bff/bff-env";

/** The CPR sub-paths (relative to /customerManagement/v1/) this BFF is allowed to forward, by method. */
const ALLOWLIST: { method: string; test: (subPath: string) => boolean }[] = [
  { method: "POST", test: (p) => p === "party" },
  { method: "POST", test: (p) => p === "customer" },
  { method: "POST", test: (p) => p === "contract" },
  { method: "GET", test: (p) => /^party\/[^/]+$/.test(p) },
  { method: "GET", test: (p) => /^customer\/[^/]+$/.test(p) },
  { method: "GET", test: (p) => /^contract\/[^/]+$/.test(p) },
  { method: "GET", test: (p) => /^customerview\/[^/]+$/.test(p) },
];

function isAllowed(method: string, subPath: string): boolean {
  return ALLOWLIST.some((a) => a.method === method && a.test(subPath));
}

/** The DXP error envelope the cpr-http driver already understands. */
function envelope(status: number, code: number, reason: string, message: string): Response {
  return new Response(JSON.stringify({ code, reason, message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export interface BffCprDeps {
  config: BffCprConfig;
  resolveTenant: (brand: string) => string;
  /** Upstream fetch — the real global fetch in prod; a stub in tests. */
  fetchUpstream: typeof fetch;
}

/**
 * Handle one `/bff/cpr/*` request. `subPath` is the CPR path after `/bff/cpr/` (e.g. "party" or
 * "customerview/cust-1"). `brand` comes from the X-App-Brand header the client sends.
 */
export async function handleBffCpr(request: Request, deps: BffCprDeps): Promise<Response> {
  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  // Everything after /bff/cpr/ is the CPR sub-path. Trim leading/trailing slashes.
  const subPath = url.pathname.replace(/^\/bff\/cpr\/?/, "").replace(/\/+$/, "");

  // Allowlist — not an open relay. Unknown path/method → 404 (don't reveal intent).
  if (!isAllowed(method, subPath)) {
    return envelope(404, 40400, "Not Found", `No BFF route for ${method} /${subPath}`);
  }

  // Server-held config. Missing → unavailable envelope the seam maps to a normal SeamError.
  const { baseUrl, token } = deps.config;
  if (!baseUrl || !token) {
    return envelope(503, 5030, "Service Unavailable", "CPR BFF is not configured");
  }

  // Resolve the DXP tenant from the app brand (server-side; the map is off the client).
  const brand = request.headers.get("X-App-Brand") ?? "";
  const tenant = deps.resolveTenant(brand);

  // Forward: pass method + body through; inject the secret token + tenant. No body logging.
  const upstreamHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "X-Tenant-ID": tenant,
  };
  const init: RequestInit = { method, headers: upstreamHeaders };
  if (method !== "GET" && method !== "HEAD") {
    init.body = await request.text(); // raw body passthrough (already JSON from the driver)
  }

  try {
    const upstream = await deps.fetchUpstream(`${baseUrl}/customerManagement/v1/${subPath}`, init);
    // Return the upstream status + body unchanged (same shape the driver's error mapping expects).
    const body = await upstream.text();
    // Preserve an empty body as empty (e.g. a 204): forcing a JSON content-type on "" would make
    // the driver's res.json() throw → a spurious badResponse. Only label a non-empty body as JSON.
    return new Response(body === "" ? null : body, {
      status: upstream.status,
      ...(body === "" ? {} : { headers: { "content-type": "application/json" } }),
    });
  } catch {
    // Upstream unreachable → unavailable envelope (retryable at the seam). Never leak the error.
    return envelope(503, 5031, "Service Unavailable", "CPR upstream unreachable");
  }
}
