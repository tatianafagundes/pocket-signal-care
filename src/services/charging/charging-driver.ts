import type { SeamResult } from "@/services/seam-result";
import type { Balance } from "@/services/model";

/*
 * ChargingDriver (ECEV) — the interface the mock and http client implement. (Spec Fase 4.4)
 * Prepaid balance: read, top up, and deduct for an order. driverFor('ecev') picks the impl.
 * Amounts are minor units (euro cents). Never throws → SeamResult.
 */
export interface ChargingDriver {
  getBalance(customerId: string): Promise<SeamResult<Balance | null>>;
  topUp(customerId: string, amountMinor: number): Promise<SeamResult<Balance>>;
  /** Deduct a charge from a customer's balance (Fase 6 buy flow). Refuses to go negative. */
  rateAndDeduct(customerId: string, amountMinor: number): Promise<SeamResult<{ ok: true }>>;
}
