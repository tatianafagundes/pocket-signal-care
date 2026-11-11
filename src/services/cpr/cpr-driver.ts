import type { SeamResult } from "@/services/seam-result";
import type { Customer, Party } from "@/services/model";
import type { PartyInput, CustomerInput } from "@/schemas/cpr";
import type { TenantId } from "@/lib/tenant-rules";

/*
 * CprDriver — the interface both the mock and the http client implement. (Spec Fase 3.3)
 *
 * The seam (cpr.functions.ts) talks only to this interface; which implementation it gets is
 * chosen by driverFor('cpr'). Each method returns a SeamResult (never throws).
 *
 * CPR owns ONLY party + customer. The installed base (EOC/order) and balance (ECEV/charging)
 * come from their own seams — the Customer360 fan-out lives in cpr.functions.getCustomer360,
 * which calls those seams and then composeCustomer360. (Fase 4 moved that fan-out out of the
 * driver, where it had been temporarily parked.)
 */
export interface CprDriver {
  resolveTenant(
    tenantId: TenantId,
  ): Promise<SeamResult<{ exists: boolean; id: TenantId; name: string }>>;
  createParty(input: PartyInput): Promise<SeamResult<{ partyId: string }>>;
  createCustomer(input: CustomerInput): Promise<SeamResult<{ customerId: string }>>;
  /** The customer and its party — CPR's half of the 360. The seam adds installed base + balance. */
  getCustomerAndParty(
    customerId: string,
  ): Promise<SeamResult<{ customer: Customer; party: Party }>>;
}

/** Re-exported so driver files have the party/customer shapes without a deep import. */
export type { Customer, Party };
