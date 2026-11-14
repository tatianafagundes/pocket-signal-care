/*
 * Driver selection — the one place env flags are read. (Spec Fase 0.4 / 8)
 *
 * Each seam asks here which driver to use. Default is "mock" for every seam, so the demo runs
 * with no .env. Flip a flag to "http" (via VITE_<SEAM>_DRIVER) when the real endpoint exists —
 * CPR is the only one intended to go real. Confining the env read to this module mirrors the
 * reference pattern (env never scattered across seams).
 */

export type SeamDriver = "mock" | "http";
export type SeamName =
  "cpr" | "ecm" | "eoc" | "ecev" | "resource" | "auth" | "payment" | "logistics" | "preferences";

const ENV_KEY: Record<SeamName, string> = {
  cpr: "VITE_CPR_DRIVER",
  ecm: "VITE_ECM_DRIVER",
  eoc: "VITE_EOC_DRIVER",
  ecev: "VITE_ECEV_DRIVER",
  resource: "VITE_RESOURCE_DRIVER",
  auth: "VITE_AUTH_DRIVER",
  payment: "VITE_PAYMENT_DRIVER",
  logistics: "VITE_LOGISTICS_DRIVER",
  preferences: "VITE_PREFERENCES_DRIVER",
};

/** The driver for a seam. "mock" unless its env flag is explicitly "http". */
export function driverFor(seam: SeamName): SeamDriver {
  const raw = import.meta.env[ENV_KEY[seam]];
  return raw === "http" ? "http" : "mock";
}

/**
 * Fail-safe for the AUTH seam only. (Spec Fase 5 security review — CRITICAL)
 *
 * The default driver is "mock" for every seam so the demo runs with no .env. For auth that is
 * dangerous: the mock login accepts ANY credential, so a production build that forgot to set
 * VITE_AUTH_DRIVER would ship a permissive login. This guard makes that a hard failure instead
 * of a silent one: in a PROD build the auth mock is forbidden — the pipeline MUST set an http
 * driver. In dev/preview the mock stays the default with no friction.
 */
export function authDriverOrThrow(): SeamDriver {
  const d = driverFor("auth");
  if (import.meta.env.PROD && d === "mock") {
    throw new Error(
      "auth mock driver is forbidden in production builds; set VITE_AUTH_DRIVER to a real driver",
    );
  }
  return d;
}

/*
 * Config fail-fast. (Code-review P2: operability)
 *
 * Called once at startup. Two independent checks, scaled to what's actually true today:
 *
 *  1. COHERENCE (hard — throws): if a seam is set to "http" but the env vars its client needs are
 *     missing, that's a broken deploy, not a valid state — fail the boot loudly rather than let
 *     every call fail at runtime with notConfigured. Only CPR has such vars today (base URL +
 *     token); the other http drivers are pure stubs with nothing to validate yet.
 *
 *  2. PROD-READINESS (soft — warns): a seam that is "intended to go real" but is still on "mock" in
 *     a PROD build is serving demo data as if real. That is NOT a throw today, because no http
 *     driver except auth is production-ready (CPR's endpoints still need reconciling — see
 *     cpr-http.ts / the contracts KB), so mock is a legitimate interim state. We surface it as a
 *     structured warning so an operator sees it; turning it into a throw is a Fase-8 decision for
 *     when the CPR http driver is complete. Auth is exempt — authDriverOrThrow already hard-fails.
 */

/**
 * Env vars a seam's http client REQUIRES at boot. CPR no longer requires any client var: the driver
 * posts to the same-origin BFF (default `/bff/cpr`) and the token + base URL live SERVER-side (the
 * Worker env, read by the BFF), so there is nothing client-side to validate here. (The BFF checks
 * its own server config at request time → a 503 envelope.)
 */
const REQUIRED_HTTP_ENV: Partial<Record<SeamName, readonly string[]>> = {};

/** Seams intended to run against a real backend in production (today: only CPR). Auth is handled
 *  separately by authDriverOrThrow. */
const PROD_SHOULD_BE_HTTP: readonly SeamName[] = ["cpr"];

function warnConfig(detail: Record<string, unknown>): void {
  // Structured, so a collector can catch it; boot-time, so no seam-logger dependency.
  console.warn(JSON.stringify({ kind: "config-warning", ...detail }));
}

/**
 * Safety rail (cpr-bff-auth Task 3, generalized to recharge in cpr-recharge Task 6.2): a seam that
 * goes real through a same-origin BFF holds its token SERVER-side (the BFF injects it). A
 * `VITE_<SEAM>_TOKEN` in a build using that seam's http driver would put a token back on the
 * client — the exact thing the BFF removed. Throw so the misconfiguration can never ship. (The old
 * CPR rail checked localhost BECAUSE the token was on the client; that premise is gone, so the base
 * URL — now a same-origin BFF prefix — is no longer constrained here.)
 *
 * `seam` is the seam name; `viteKey` is the client token var it must NOT have; `serverKey` is the
 * server-only var to use instead. Both CPR and recharge (ecev) are BFF-fronted, so both are railed.
 */
function assertClientHasNoToken(seam: SeamName, viteKey: string, serverKey: string): void {
  const token = import.meta.env[viteKey] as string | undefined;
  if (token !== undefined && token !== "") {
    throw new Error(
      `${viteKey} is set, but the ${seam} token now lives server-side (the BFF injects it). A ` +
        `client token would undo the BFF. Remove ${viteKey}; set ${serverKey} as a server-only ` +
        `(non-VITE) var for the BFF instead.`,
    );
  }
}

/**
 * D1 warning: VITE_CPR_ACTIVE_BRAND names the brand this build acts as. Two seams now depend on it:
 *  - CPR: getCustomerAndParty stamps the DXP tenant from it, and getCustomer360 rejects a 360 whose
 *    tenant ≠ the route brand — an invalid brand can reject every 360 as notFound.
 *  - recharge (ecev, Task 6.2): charging-http sends it as X-App-Brand so the BFF resolves the DXP
 *    X-Tenant-ID — an invalid brand routes the recharge to the TEN_FAKE placeholder, not the real
 *    tenant.
 * Warn (don't throw: the default brand is a valid single-brand state) when EITHER seam is http and
 * the brand is unset/invalid.
 */
function warnActiveBrand(): void {
  const brandSeamIsHttp = driverFor("cpr") === "http" || driverFor("ecev") === "http";
  if (!brandSeamIsHttp) return;
  const brand = import.meta.env["VITE_CPR_ACTIVE_BRAND"] as string | undefined;
  const valid = brand === "drei" || brand === "dreigo";
  if (!valid) {
    warnConfig({
      seam: driverFor("cpr") === "http" ? "cpr" : "ecev",
      message:
        "VITE_CPR_ACTIVE_BRAND is unset/invalid while CPR or recharge is http — CPR stamps the " +
        "default brand on the 360 (getCustomer360 may reject every 360 as notFound) and recharge " +
        "sends the default brand as X-App-Brand (the BFF resolves it to the TEN_FAKE tenant). Set " +
        "VITE_CPR_ACTIVE_BRAND to the build's brand.",
      envKey: "VITE_CPR_ACTIVE_BRAND",
    });
  }
}

/**
 * Validate driver configuration at startup. Throws on an incoherent http config; warns (never
 * throws) when a prod build leaves a real-able seam on mock. Safe to call in any environment.
 */
export function assertDriverConfig(): void {
  const seams: SeamName[] = [
    "cpr",
    "ecm",
    "eoc",
    "ecev",
    "resource",
    "auth",
    "payment",
    "logistics",
    "preferences",
  ];

  for (const seam of seams) {
    const driver = driverFor(seam);

    // 1. Coherence: http selected but its required env is missing → hard failure.
    if (driver === "http") {
      const required = REQUIRED_HTTP_ENV[seam] ?? [];
      const missing = required.filter((key) => {
        const v = import.meta.env[key];
        return v === undefined || v === "";
      });
      if (missing.length > 0) {
        throw new Error(
          `${seam} driver is "http" but required config is missing: ${missing.join(", ")}. ` +
            `Set them or switch ${ENV_KEY[seam]} back to "mock".`,
        );
      }
    }

    // 1b. BFF-fronted safety rail: the token lives server-side (the BFF injects it). Refuse a client
    //     VITE_<SEAM>_TOKEN so a token can never be put back on the client. CPR (Task 3) and recharge
    //     (ecev, Task 6.2) both go real through a same-origin BFF.
    if (seam === "cpr" && driver === "http") {
      assertClientHasNoToken("cpr", "VITE_CPR_TOKEN", "CPR_TOKEN");
    }
    if (seam === "ecev" && driver === "http") {
      assertClientHasNoToken("ecev", "VITE_ECEV_TOKEN", "RECHARGE_TOKEN");
    }

    // 2. Prod-readiness: a real-able seam still on mock in a prod build → warn (not auth; that
    //    seam hard-fails in authDriverOrThrow).
    if (import.meta.env.PROD && driver === "mock" && PROD_SHOULD_BE_HTTP.includes(seam)) {
      warnConfig({
        seam,
        message: `${seam} is on the mock driver in a production build — serving demo data, not a real backend`,
        envKey: ENV_KEY[seam],
      });
    }
  }

  // 3. Active-brand sanity (D1) — warn if CPR or recharge is http but the brand that stamps the 360
  //    tenant / the recharge X-App-Brand is unset/invalid. After the loop so it runs once.
  warnActiveBrand();
}
