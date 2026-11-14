import type { SeamResult } from "@/services/seam-result";
import type { Customer, Party, Contract, PartyInteraction } from "@/services/model";
import type {
  PartyInput,
  CustomerInput,
  CreateContractInput,
  CreateInteractionInput,
} from "@/schemas/cpr";
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
  /** Create the prepaid contract keyed by the reserved MSISDN. Requires an existing customer. */
  createContract(input: CreateContractInput): Promise<SeamResult<{ contractId: string }>>;
  /**
   * The customer, its party, and its active prepaid contract (or null) — CPR's half of the 360.
   * The contract carries the `contractId` the recharge journey needs for a returning customer.
   * The seam adds installed base + balance.
   */
  getCustomerAndParty(
    customerId: string,
  ): Promise<SeamResult<{ customer: Customer; party: Party; contract: Contract | null }>>;
  /** Record a Party Interaction (TMF683) — e.g. onboarding fulfilment. Tenant comes from input. */
  createInteraction(input: CreateInteractionInput): Promise<SeamResult<PartyInteraction>>;
  /** The customer's party interactions, newest first — the activity timeline / CSR history. */
  listInteractions(customerId: string): Promise<SeamResult<PartyInteraction[]>>;
}

/** Re-exported so driver files have the party/customer/contract shapes without a deep import. */
export type { Customer, Party, Contract };
