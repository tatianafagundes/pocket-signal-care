import type { AutoTopUpConfig, Balance } from "@/services/model";

/*
 * Auto top-up decision rule — pure and testable. (Prepaid auto-recharge.)
 *
 * The ONE decision the feature turns on: given the current config and balance, should a top-up be
 * charged now? This is the real logic that would run on every balance-threshold notification in a
 * live system. In this mock there is no scheduler firing it on a clock — a demo control calls this
 * rule and, when it returns true, runs the top-up. So the decision ships for real; only the trigger
 * is simulated (see the auto-top-up debt doc).
 *
 * Money is minor units. A null balance (brand-new, no record) never triggers — there is nothing to
 * measure against, and a real threshold notification implies an existing balance.
 */

/** True when auto top-up is enabled and the balance has fallen below the configured threshold. */
export function shouldAutoTopUp(config: AutoTopUpConfig | null, balance: Balance | null): boolean {
  if (!config || !config.enabled) return false;
  if (balance === null) return false;
  return balance.amountMinor < config.thresholdMinor;
}
