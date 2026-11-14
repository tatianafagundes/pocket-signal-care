/*
 * Server-only secret accessor for the BFF. (cpr-bff-auth Task 1)
 *
 * This module is imported ONLY by server route handlers — never by client code. It reads secrets
 * from the Cloudflare Worker env, which Nitro's cloudflare preset exposes as `globalThis.__env__`
 * (see the Task 0 spike, readiness doc §8), with a `process.env` fallback for dev/Node. It
 * deliberately NEVER touches `import.meta.env` — a VITE_-prefixed read would bundle the value into
 * client JS, which is exactly what the BFF exists to avoid.
 *
 * Keys read here MUST NOT be `VITE_`-prefixed. A missing secret returns `null` (callers turn that
 * into a clean error envelope), never an empty string that would become `Bearer undefined`.
 */

/** Read a server-only env var. Returns null if unset/empty. NON-VITE keys only. */
export function serverEnv(key: string): string | null {
  if (key.startsWith("VITE_")) {
    // A VITE_ var is client-bundled — reading it here would defeat the BFF. Refuse loudly.
    throw new Error(`bff serverEnv: refusing to read a VITE_-prefixed key ("${key}") server-side`);
  }
  // 1. Cloudflare Worker bindings (prod) — Nitro sets globalThis.__env__ = env per request.
  const workerEnv = (globalThis as Record<string, unknown>)["__env__"];
  if (workerEnv && typeof workerEnv === "object") {
    const v = (workerEnv as Record<string, unknown>)[key];
    if (typeof v === "string" && v !== "") return v;
  }
  // 2. process.env (dev/Node, and Nitro's Worker polyfill over __env__).
  if (typeof process !== "undefined" && process.env) {
    const v = process.env[key];
    if (typeof v === "string" && v !== "") return v;
  }
  return null;
}

/** The CPR config the BFF forwards with. Null fields mean "not configured" (caller → envelope). */
export interface BffCprConfig {
  baseUrl: string | null;
  token: string | null;
}

export function readBffCprConfig(): BffCprConfig {
  return {
    baseUrl: serverEnv("CPR_BASE_URL"),
    token: serverEnv("CPR_TOKEN"),
  };
}

/**
 * The recharge (CBEV/ECEV) config the recharge BFF forwards with. Same shape as CPR but a distinct
 * base URL + token: recharge talks to the charging domain, not CPR. (cpr-recharge Task 5)
 *
 * D-recharge-token: `RECHARGE_TOKEN` is a server-only static bearer for the fake. Real recharge uses
 * an OAuth2 client-credentials grant against Keycloak (grant + refresh) — a documented follow-up,
 * NOT wired here. Swapping to the real grant is isolated to this reader + the proxy's header
 * injection; the client contract (same-origin, no token) does not change.
 */
export interface BffRechargeConfig {
  baseUrl: string | null;
  token: string | null;
}

export function readBffRechargeConfig(): BffRechargeConfig {
  return {
    baseUrl: serverEnv("RECHARGE_BASE_URL"),
    token: serverEnv("RECHARGE_TOKEN"),
  };
}

/**
 * Resolve the app brand slug → the DXP tenant id (sent as X-Tenant-ID). Server-side twin of the
 * client-side resolver that used to live in cpr-http.ts; the brand→TEN map now lives in server env
 * (`CPR_TENANT_<BRAND>`), off the client. Falls back to the TEN_FAKE placeholder (the fake accepts
 * any value); the real map is a documented debt.
 */
export function resolveDxpTenant(brand: string): string {
  const key = `CPR_TENANT_${brand.toUpperCase()}`;
  return serverEnv(key) ?? "TEN_FAKE";
}
