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
  /**
   * Qualify an offer. `balanceMinor` is the customer's current balance (when one exists), which
   * the SEAM fetches from charging and passes in — the catalog driver owns the catalogue, not
   * the wallet, so it doesn't fetch balance itself. The pure rule uses it for eligibility.
   */
  qualifyOffer(
    offerId: string,
    ctx: QualifyContext,
    balanceMinor?: number,
  ): Promise<SeamResult<QualifyResult>>;
}
