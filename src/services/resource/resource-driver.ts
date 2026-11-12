import type { SeamResult } from "@/services/seam-result";
import type { EsimProfile, Msisdn, SimValidation } from "@/services/model";
import type { TenantId } from "@/lib/tenant-rules";

/*
 * ResourceDriver (DSIMA) — the interface the mock and http client implement. (Spec Fase 4.4b / Req 14)
 * SIM/MSISDN selection + reservation — the first step of prepaid onboarding. Fase 7 adds eSIM
 * provisioning (GSMA SGP.22 via the esimProfile extension): request a profile, poll its lifecycle.
 * driverFor('resource') picks the impl. Never throws → SeamResult.
 */
export interface ResourceDriver {
  listAvailableMsisdn(tenantId: TenantId): Promise<SeamResult<Msisdn[]>>;
  /** Reserve a number; removes it from the available pool (exercises concurrency). */
  reserveMsisdn(tenantId: TenantId, msisdn: string): Promise<SeamResult<{ reservationId: string }>>;
  validateSim(iccid: string): Promise<SeamResult<SimValidation>>;
  /** Ask the SM-DP+ (mock) for an eSIM profile for a customer. Idempotent per customer+tenant. */
  requestEsimProfile(customerId: string, tenantId: TenantId): Promise<SeamResult<EsimProfile>>;
  /** Poll a profile's lifecycle by id (resolve ready/downloaded/installed after the fact). */
  getEsimProfile(esimProfileId: string): Promise<SeamResult<EsimProfile>>;
}
