import type { SeamResult } from "@/services/seam-result";
import type { Msisdn, SimValidation } from "@/services/model";
import type { TenantId } from "@/lib/tenant-rules";

/*
 * ResourceDriver (DSIMA) — the interface the mock and http client implement. (Spec Fase 4.4b / Req 14)
 * SIM/MSISDN selection + reservation — the first step of prepaid onboarding.
 * driverFor('resource') picks the impl. Never throws → SeamResult.
 */
export interface ResourceDriver {
  listAvailableMsisdn(tenantId: TenantId): Promise<SeamResult<Msisdn[]>>;
  /** Reserve a number; removes it from the available pool (exercises concurrency). */
  reserveMsisdn(tenantId: TenantId, msisdn: string): Promise<SeamResult<{ reservationId: string }>>;
  validateSim(iccid: string): Promise<SeamResult<SimValidation>>;
}
