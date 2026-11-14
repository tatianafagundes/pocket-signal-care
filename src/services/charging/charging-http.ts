import { ok, err, seamError, type SeamError, type SeamResult } from "@/services/seam-result";
import type {
  ActivityItem,
  Balance,
  RechargeResult,
  UsageBucket,
  VoucherRedemption,
} from "@/services/model";
import type { RechargeInput } from "@/schemas/charging";
import type { ChargingDriver } from "@/services/charging/charging-driver";

/*
 * Charging (ECEV) http driver. (recharge spec Task 4b — getBalance; Task 4 — recharge)
 *
 * Real ECEV/CBEV when VITE_ECEV_DRIVER=http. Like the CPR driver, it posts to a same-origin BFF
 * (`/bff/recharge`, Task 5) that holds the DXP token server-side — this driver carries NO token.
 *
 * SCOPE so far:
 *   - getBalance → TMF654 prepaid bucket read (Task 4b). Documented shape (docs/contracts/
 *     cbev-charging.md): GET /bae/bssTmf654PrepayBalanceManagement/v1/bucket?communicationId=…
 *   - recharge   → payment direct-capture + monetaryRecharge journey (Task 4; notConfigured here).
 * The rest (topUp/redeemVoucher/rateAndDeduct/getUsage/grantAllowance/getActivity) stay
 * notConfigured — out of scope for the recharge spec.
 *
 * getBalance is keyed by the MSISDN (communicationId), which the bucket read needs. The seam passes
 * a customerId; until a customer→MSISDN resolution is wired, this driver cannot turn a bare
 * customerId into an MSISDN — so getBalance here is reachable via the recharge op (which HAS the
 * MSISDN), not the bare getBalance(customerId) seam. See readBalanceByMsisdn.
 */

/** Injectable fetch — production uses the global; the contract test passes a recording shim. */
type FetchLike = typeof fetch;

/** The same-origin recharge BFF prefix. FIXED (K1 lesson): the client never chooses the host. */
const BFF_PREFIX = "/bff/recharge";
const TIMEOUT_MS = 10_000;

/** The DXP error envelope — every non-2xx response carries { code, reason, message }. */
interface DxpError {
  code?: number;
  reason?: string;
  message?: string;
}

/** Map an HTTP status + the parsed envelope to a SeamError. 33028 = reused authorizationCode. */
function mapHttpError(status: number, body: DxpError): SeamError {
  const code = body.code;
  const detail = body.message ?? body.reason;
  const seamCode = `charging.http.${code ?? status}`;
  if (status === 404) return seamError(seamCode, "notFound", "contactSupport", detail);
  // Reused authorizationCode (direct-capture) or a duplicate → conflict, not retryable.
  if (status === 409 || code === 33028) return seamError(seamCode, "conflict", "fixInput", detail);
  if (status >= 400 && status < 500) return seamError(seamCode, "rejected", "fixInput", detail);
  return seamError(seamCode, "unavailable", "retry", detail);
}

/* ---- TMF654 bucket read mapping (the only place the wire shape lives) ---- */
interface TmfBucket {
  amount?: { unit?: string; value?: number };
  validFor?: { endDateTime?: string };
}
/** Map a decimal EUR amount to minor units (euro cents), guarding float rounding. */
function decimalToMinor(value: number): number {
  return Math.round(value * 100);
}
/** The bucket list → domain Balance, or null when the line has no bucket yet. */
function fromTmfBucket(json: unknown): Balance | null {
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

export function createChargingHttp(injectedFetch?: FetchLike): ChargingDriver {
  const doFetch: FetchLike = injectedFetch ?? fetch;

  const notConfigured = <T>(): SeamResult<T> =>
    err(
      seamError(
        "charging.http.notConfigured",
        "unavailable",
        "contactSupport",
        "This ECEV operation is not wired on the http driver yet (out of scope).",
      ),
    );

  /** GET/POST the recharge BFF, parse the envelope on non-2xx, map the 2xx body. Never throws. */
  async function request<T>(
    path: string,
    init: RequestInit,
    mapResponse: (json: unknown) => T,
  ): Promise<SeamResult<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await doFetch(`${BFF_PREFIX}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      });
      if (!res.ok) {
        let body: DxpError = {};
        try {
          body = (await res.json()) as DxpError;
        } catch {
          /* non-JSON error body → fall back to the status */
        }
        return err(mapHttpError(res.status, body));
      }
      const json: unknown = await res.json();
      try {
        return ok(mapResponse(json));
      } catch {
        return err(seamError("charging.http.badResponse", "unknown", "contactSupport"));
      }
    } catch {
      return err(seamError("charging.http.unavailable", "unavailable", "retry"));
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Read the prepaid balance for an MSISDN via the TMF654 bucket read. Exposed for the recharge op
   * (Task 4), which has the MSISDN. The bare getBalance(customerId) seam stays notConfigured until a
   * customer→MSISDN resolution exists (recorded follow-up).
   */
  async function readBalanceByMsisdn(communicationId: string): Promise<SeamResult<Balance | null>> {
    return request(
      `/bae/bssTmf654PrepayBalanceManagement/v1/bucket?communicationId=${encodeURIComponent(communicationId)}`,
      { method: "GET" },
      (json) => fromTmfBucket(json),
    );
  }

  return {
    // getBalance takes a bare customerId, which the bucket read can't key on (it needs the MSISDN).
    // Until a customer→MSISDN resolution is wired, the bare seam read stays notConfigured; the
    // recharge op reads the balance via readBalanceByMsisdn with the MSISDN it already has.
    getBalance: (): Promise<SeamResult<Balance | null>> =>
      Promise.resolve(notConfigured<Balance | null>()),
    topUp: (): Promise<SeamResult<Balance>> => Promise.resolve(notConfigured<Balance>()),
    // Real recharge (payment direct-capture → monetaryRecharge) is wired in Task 4.
    recharge: (_input: RechargeInput): Promise<SeamResult<RechargeResult>> =>
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

    // Internal — not on the ChargingDriver interface; used by the recharge op (Task 4).
    readBalanceByMsisdn,
  } as ChargingDriver & { readBalanceByMsisdn: typeof readBalanceByMsisdn };
}
