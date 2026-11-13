import type { SeamResult } from "@/services/seam-result";
import type { AutoTopUpConfig } from "@/services/model";

/*
 * PreferencesDriver — the interface the mock and http client implement. (Auto top-up opt-in state.)
 *
 * Holds the per-customer auto top-up configuration (DXP auto-recharge: the opt-in status + selected
 * amount, persisted and toggled from self-care). driverFor('preferences') picks the impl.
 * Never throws → SeamResult. Real CBEV/DXP persists this as auto-recharge state + a payment
 * agreement (Fase 8); the mock keeps it in a module-level map.
 */
export interface PreferencesDriver {
  /** The customer's auto top-up config, or null when they've never set it up. */
  getAutoTopUp(customerId: string): Promise<SeamResult<AutoTopUpConfig | null>>;
  /**
   * Enable (or update) auto top-up for a customer with the given threshold + amount. The driver
   * attaches the saved method and stamps the consent timestamp. Returns the stored config.
   */
  setAutoTopUp(
    customerId: string,
    thresholdMinor: number,
    amountMinor: number,
  ): Promise<SeamResult<AutoTopUpConfig>>;
  /** Disable auto top-up (opt-out). Returns the stored, now-disabled config. */
  disableAutoTopUp(customerId: string): Promise<SeamResult<AutoTopUpConfig>>;
}
