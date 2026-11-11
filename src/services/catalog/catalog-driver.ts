import type { SeamResult } from "@/services/seam-result";
import type { Offer } from "@/services/model";
import type { TenantId } from "@/lib/tenant-rules";
import type { QualifyResult } from "@/services/catalog-rules";
import type { QualifyContext } from "@/schemas/catalog";

/*
 * CatalogDriver (ECM) — the interface the mock and the http client implement. (Spec Fase 4.2)
 * The seam talks only to this; driverFor('ecm') picks the impl. Never throws → SeamResult.
 */
export interface CatalogDriver {
  listOffers(tenantId: TenantId): Promise<SeamResult<Offer[]>>;
  qualifyOffer(offerId: string, ctx: QualifyContext): Promise<SeamResult<QualifyResult>>;
}
