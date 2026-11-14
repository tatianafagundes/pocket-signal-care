import { err, seamError, type SeamResult } from "@/services/seam-result";
import type {
  ActivityItem,
  Balance,
  RechargeResult,
  UsageBucket,
  VoucherRedemption,
} from "@/services/model";
import type { ChargingDriver } from "@/services/charging/charging-driver";

/*
 * Charging (ECEV) http driver — STUB. (Spec Fase 4.4 / 8.2)
 * Real ECEV (TMF654 prepaid balance) when VITE_ECEV_DRIVER=http. Stays mock for the demo;
 * minimal stub until wired. TMF654 mapping would live only here.
 */
export function createChargingHttp(): ChargingDriver {
  const notConfigured = <T>(): SeamResult<T> =>
    err(
      seamError(
        "charging.http.notConfigured",
        "unavailable",
        "contactSupport",
        "ECEV http driver selected but no endpoint is configured.",
      ),
    );
  return {
    getBalance: (): Promise<SeamResult<Balance | null>> =>
      Promise.resolve(notConfigured<Balance | null>()),
    topUp: (): Promise<SeamResult<Balance>> => Promise.resolve(notConfigured<Balance>()),
    // Real recharge (payment direct-capture → monetaryRecharge) is wired in Task 4.
    recharge: (): Promise<SeamResult<RechargeResult>> =>
      Promise.resolve(notConfigured<RechargeResult>()),
    redeemVoucher: (): Promise<SeamResult<VoucherRedemption>> =>
      Promise.resolve(notConfigured<VoucherRedemption>()),
    rateAndDeduct: () => Promise.resolve(notConfigured()),
    getUsage: (): Promise<SeamResult<UsageBucket[]>> =>
      Promise.resolve(notConfigured<UsageBucket[]>()),
    grantAllowance: (): Promise<SeamResult<UsageBucket>> =>
      Promise.resolve(notConfigured<UsageBucket>()),
    getActivity: (): Promise<SeamResult<ActivityItem[]>> =>
      Promise.resolve(notConfigured<ActivityItem[]>()),
  };
}
