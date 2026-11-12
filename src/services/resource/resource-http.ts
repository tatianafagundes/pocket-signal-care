import { err, seamError, type SeamResult } from "@/services/seam-result";
import type { EsimProfile, Msisdn, SimValidation } from "@/services/model";
import type { ResourceDriver } from "@/services/resource/resource-driver";

/*
 * Resource (DSIMA) http driver — STUB. (Spec Fase 4.4b / 8.2)
 * Real DSIMA / Resource Management when VITE_RESOURCE_DRIVER=http. Stays mock for the demo;
 * minimal stub until wired. Protocol mapping would live only here.
 */
export function createResourceHttp(): ResourceDriver {
  const notConfigured = <T>(): SeamResult<T> =>
    err(
      seamError(
        "resource.http.notConfigured",
        "unavailable",
        "contactSupport",
        "DSIMA http driver selected but no endpoint is configured.",
      ),
    );
  return {
    listAvailableMsisdn: (): Promise<SeamResult<Msisdn[]>> =>
      Promise.resolve(notConfigured<Msisdn[]>()),
    reserveMsisdn: () => Promise.resolve(notConfigured()),
    validateSim: (): Promise<SeamResult<SimValidation>> =>
      Promise.resolve(notConfigured<SimValidation>()),
    requestEsimProfile: (): Promise<SeamResult<EsimProfile>> =>
      Promise.resolve(notConfigured<EsimProfile>()),
    getEsimProfile: (): Promise<SeamResult<EsimProfile>> =>
      Promise.resolve(notConfigured<EsimProfile>()),
  };
}
