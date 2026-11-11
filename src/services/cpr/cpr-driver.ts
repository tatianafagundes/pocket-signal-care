import type { SeamResult } from "@/services/seam-result";
import type { Customer, Party } from "@/services/model";
import type { Customer360Parts } from "@/services/customer360-rules";
import type { PartyInput, CustomerInput } from "@/schemas/cpr";
import type { TenantId } from "@/lib/tenant-rules";

/*
 * CprDriver — the interface both the mock and the http client implement. (Spec Fase 3.3)
 *
 * The seam (cpr.functions.ts) talks only to this interface; which implementation it gets is
 * chosen by driverFor('cpr'). Each method returns a SeamResult (never throws). The driver
 * returns the raw parts for the 360 (party/customer/installed base/balance); the PURE
 * composition into Customer360 happens in the seam via customer360-rules, not here.
 */
export interface CprDriver {
  resolveTenant(
    tenantId: TenantId,
  ): Promise<SeamResult<{ exists: boolean; id: TenantId; name: string }>>;
  createParty(input: PartyInput): Promise<SeamResult<{ partyId: string }>>;
  createCustomer(input: CustomerInput): Promise<SeamResult<{ customerId: string }>>;
  /**
   * Returns the parts for the 360; the seam composes them with the pure rule.
   *
   * FASE 4 DEBT (read before extending): today this returns installedBase + balance too, which
   * really belong to the EOC (order) and ECEV (charging) seams — the CPR mock seeds them only
   * because those seams don't exist yet. When Fase 4 lands, do NOT keep sourcing them here:
   * shrink the CPR driver to return party + customer only, and move the fan-out
   * (order.getInstalledBase + charging.getBalance) up into cpr.functions.getCustomer360, which
   * then calls composeCustomer360. The pure rule and the UI do not change — only this interface
   * and the seam's getCustomer360 do.
   */
  getCustomer360Parts(customerId: string): Promise<SeamResult<Customer360Parts>>;
}

/** Re-exported so driver files have the party/customer shapes without a deep import. */
export type { Customer, Party };
