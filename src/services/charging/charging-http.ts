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
 * Charging (ECEV) http driver. (recharge spec)
 *
 * Real ECEV/CBEV when VITE_ECEV_DRIVER=http. Will post to a same-origin BFF (`/bff/recharge`,
 * Task 5) that holds the DXP token server-side — this driver carries NO token.
 *
 * Task 4b delivers the TMF654 bucket-read MAPPER (`fromTmfBucket`) + its fake endpoint; the
 * transport (the recharge BFF request helper + readBalanceByMsisdn) lands in Task 4 with the
 * recharge op that consumes it, so there is no dead transport here. Every op stays notConfigured
 * until Task 4 wires the recharge flow. Documented bucket shape: docs/contracts/cbev-charging.md,
 * GET /bae/bssTmf654PrepayBalanceManagement/v1/bucket?communicationId=…
 */

/* ---- TMF654 bucket read mapping (the only place the wire shape lives) ---- */
interface TmfBucket {
  amount?: { unit?: string; value?: number };
  validFor?: { endDateTime?: string };
}
/** Map a decimal EUR amount to minor units (euro cents), guarding float rounding. */
function decimalToMinor(value: number): number {
  return Math.round(value * 100);
}
/**
 * The bucket list → domain Balance, or null when the line has no bucket yet. Exported so the
 * mapping (decimal EUR → minor, validFor → validUntil, empty → null) is unit-tested directly,
 * rather than reaching the internal readBalanceByMsisdn through a cast.
 */
export function fromTmfBucket(json: unknown): Balance | null {
  const buckets = Array.isArray(json) ? (json as TmfBucket[]) : [];
  const bucket = buckets[0];
  const value = bucket?.amount?.value;
  if (bucket === undefined || value === undefined) return null;
  return {
    amountMinor: decimalToMinor(value),
    currency: "EUR",
    ...(bucket.validFor?.endDateTime ? { validUntil: bucket.validFor.endDateTime } : {}),
  };
}

export function createChargingHttp(): ChargingDriver {
  const notConfigured = <T>(): SeamResult<T> =>
    err(
      seamError(
        "charging.http.notConfigured",
        "unavailable",
        "contactSupport",
        "This ECEV operation is not wired on the http driver yet (out of scope).",
      ),
    );

  return {
    getBalance: (): Promise<SeamResult<Balance | null>> =>
      Promise.resolve(notConfigured<Balance | null>()),
    topUp: (): Promise<SeamResult<Balance>> => Promise.resolve(notConfigured<Balance>()),
    // Real recharge (payment direct-capture → monetaryRecharge → bucket read via fromTmfBucket)
    // is wired in Task 4.
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
