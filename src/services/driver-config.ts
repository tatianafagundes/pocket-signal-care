/*
 * Driver selection — the one place env flags are read. (Spec Fase 0.4 / 8)
 *
 * Each seam asks here which driver to use. Default is "mock" for every seam, so the demo runs
 * with no .env. Flip a flag to "http" (via VITE_<SEAM>_DRIVER) when the real endpoint exists —
 * CPR is the only one intended to go real. Confining the env read to this module mirrors the
 * reference pattern (env never scattered across seams).
 */

export type SeamDriver = "mock" | "http";
export type SeamName = "cpr" | "ecm" | "eoc" | "ecev" | "resource" | "auth";

const ENV_KEY: Record<SeamName, string> = {
  cpr: "VITE_CPR_DRIVER",
  ecm: "VITE_ECM_DRIVER",
  eoc: "VITE_EOC_DRIVER",
  ecev: "VITE_ECEV_DRIVER",
  resource: "VITE_RESOURCE_DRIVER",
  auth: "VITE_AUTH_DRIVER",
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
