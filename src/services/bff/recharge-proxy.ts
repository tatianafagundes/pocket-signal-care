/*
 * Recharge BFF proxy handler. (cpr-recharge Task 5)
 *
 * The server-side half of the recharge http path: the charging-http driver calls same-origin
 * `/bff/recharge/<charging-path>` with NO token; this injects the server-held RECHARGE_TOKEN + the
 * resolved X-Tenant-ID and forwards to the real charging (CBEV/ECEV) domain. The browser never sees
 * the token.
 *
 * Mirrors cpr-proxy.ts (same injected-deps shape, same security invariants) with ONE structural
 * difference: recharge spans three DXP base paths (payment/v4, xCACcore/v1, bae/bssTmf654...), not a
 * single resource root, so the allowlist matches the FULL sub-path and the handler forwards
 * `${baseUrl}/${subPath}` verbatim — there is no single `/customerManagement/v1/` prefix to prepend.
 *
 * SECURITY: never logs request bodies (payment amounts, authCodes, MSISDNs). Never echoes env. Only
 * an allowlist of three charging paths is forwarded — this is not an open relay. The client cannot
 * forge Authorization / X-Tenant-ID: those are set server-side only.
 */

import type { BffRechargeConfig } from "@/services/bff/bff-env";

/**
 * The charging sub-paths this BFF is allowed to forward, by method. The bucket read carries a
 * `?communicationId=` query string, so its test runs against the path portion only (query stripped
 * before matching) — the query is still forwarded, just not part of the allowlist decision.
 */
const ALLOWLIST: { method: string; test: (subPath: string) => boolean }[] = [
  { method: "POST", test: (p) => p === "payment/v4/payment" },
  { method: "POST", test: (p) => p === "xCACcore/v1/customerInteraction" },
  { method: "GET", test: (p) => p === "bae/bssTmf654PrepayBalanceManagement/v1/bucket" },
];

function isAllowed(method: string, pathOnly: string): boolean {
  return ALLOWLIST.some((a) => a.method === method && a.test(pathOnly));
}

/** The DXP error envelope the charging-http driver's mapHttpError already understands. */
function envelope(status: number, code: number, reason: string, message: string): Response {
  return new Response(JSON.stringify({ code, reason, message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export interface BffRechargeDeps {
  config: BffRechargeConfig;
  resolveTenant: (brand: string) => string;
  /** Upstream fetch — the real global fetch in prod; a stub in tests. */
  fetchUpstream: typeof fetch;
}

/**
 * Handle one `/bff/recharge/*` request. The sub-path after `/bff/recharge/` is forwarded to the
 * charging domain with the server token + tenant injected. `brand` comes from X-App-Brand.
 */
export async function handleBffRecharge(
  request: Request,
  deps: BffRechargeDeps,
): Promise<Response> {
  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  // Everything after /bff/recharge/ is the charging sub-path. The query string is NOT here — the
  // URL parser keeps it in url.search — so this is already path-only. Trim leading/trailing slashes.
  const pathOnly = url.pathname.replace(/^\/bff\/recharge\/?/, "").replace(/\/+$/, "");

  // Allowlist decision runs on the path only. The query (url.search) is still forwarded below; it
  // just does not widen the allowlist.
  if (!isAllowed(method, pathOnly)) {
    return envelope(404, 40400, "Not Found", `No BFF route for ${method} /${pathOnly}`);
  }

  // Server-held config. Missing → unavailable envelope the seam maps to a normal SeamError.
  const { baseUrl, token } = deps.config;
  if (!baseUrl || !token) {
    return envelope(503, 5030, "Service Unavailable", "Recharge BFF is not configured");
  }

  // Resolve the DXP tenant from the app brand (server-side; the map is off the client).
  const brand = request.headers.get("X-App-Brand") ?? "";
  const tenant = deps.resolveTenant(brand);

  // Forward: pass method + body through; inject the secret token + tenant. No body logging. The
  // client's own Authorization / X-Tenant-ID (if any) are NOT spread in — security headers are
  // server-controlled only.
  const upstreamHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "X-Tenant-ID": tenant,
  };
  const init: RequestInit = { method, headers: upstreamHeaders };
  if (method !== "GET" && method !== "HEAD") {
    init.body = await request.text(); // raw body passthrough (already JSON from the driver)
  }

  // Forward path + query (url.search) so the bucket read's ?communicationId= reaches upstream.
  const upstreamUrl = `${baseUrl}/${pathOnly}${url.search}`;

  try {
    const upstream = await deps.fetchUpstream(upstreamUrl, init);
    const body = await upstream.text();
    // Preserve an empty body as empty (e.g. a 204): forcing a JSON content-type on "" would make
    // the driver's res.json() throw → a spurious badResponse. Only label a non-empty body as JSON.
    return new Response(body === "" ? null : body, {
      status: upstream.status,
      ...(body === "" ? {} : { headers: { "content-type": "application/json" } }),
    });
  } catch {
    // Upstream unreachable → unavailable envelope (retryable at the seam). Never leak the error.
    return envelope(503, 5031, "Service Unavailable", "Recharge upstream unreachable");
  }
}
