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
 * Charging (ECEV) http driver. (recharge spec)
 *
 * Real ECEV/CBEV when VITE_ECEV_DRIVER=http. Posts to a same-origin BFF (`/bff/recharge`, Task 5)
 * that holds the DXP token server-side — this driver carries NO token.
 *
 * WIRED:
 *   - recharge (Task 4): direct-capture POST /payment/v4/payment → monetaryRecharge journey POST
 *     /xCACcore/v1/customerInteraction → TMF654 bucket read for the resulting balance.
 * notConfigured (out of scope): topUp/redeemVoucher/rateAndDeduct/getUsage/grantAllowance/
 *   getActivity, and the bare getBalance(customerId) (no MSISDN to key the bucket — follow-up).
 *
 * Money is minor units in-domain; the decimal↔minor conversion lives ONLY in the mappers here.
 */

/** Injectable fetch — production uses the global; the contract test passes a recording shim. */
type FetchLike = typeof fetch;

/** The same-origin recharge BFF prefix. FIXED (K1 lesson): the client never chooses the host. */
const BFF_PREFIX = "/bff/recharge";
const TIMEOUT_MS = 10_000;

/* ---- money mapping (the only place decimal↔minor lives) ---- */
function decimalToMinor(value: number): number {
  return Math.round(value * 100);
}
function minorToDecimal(minor: number): number {
  return minor / 100;
}

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

/* ---- payment (direct capture, TMF676) mapping ---- */
function toTmfPayment(input: RechargeInput, authorizationCode: string): unknown {
  // Collection body: account.id = MSISDN, payer.id = customerId, amount in decimal EUR, a cash
  // method, the monetaryRecharge journey relatedEntity. The methodToken is mock-only (M3) — it is
  // NOT sent on the wire.
  return {
    authorizationCode,
    account: { id: input.communicationId, "@referredType": "MSISDN" },
    payer: { id: input.customerId, role: "Customer", "@referredType": "Customer" },
    amount: { unit: "EUR", value: minorToDecimal(input.amountMinor) },
    totalAmount: { unit: "EUR", value: minorToDecimal(input.amountMinor) },
    paymentMethod: { "@type": "cash" },
    relatedEntity: [{ "@referredType": "Journey", id: "monetaryRecharge" }],
    status: "SUCCESS",
  };
}
interface TmfPaymentResult {
  id?: string;
  authorizationCode?: string;
}
/** Read the paymentId + authorizationCode the journey needs. Throws → badResponse if id missing. */
function fromTmfPayment(json: unknown): { paymentId: string; authorizationCode: string } {
  const p = (json ?? {}) as TmfPaymentResult;
  if (!p.id || !p.authorizationCode) {
    throw new Error("CPR payment: missing id / authorizationCode in response");
  }
  return { paymentId: p.id, authorizationCode: p.authorizationCode };
}

/* ---- monetaryRecharge journey mapping ---- */
function toTmfMonetaryRecharge(
  input: RechargeInput,
  paymentId: string,
  authorizationCode: string,
): unknown {
  // Collection body: references customerId + contractId; journeyData carries the MSISDN, the
  // amount (decimal EUR), and the payment refs (merchantRefNum = paymentId, paymentGwTransactionId
  // = authorizationCode) tying the journey to the captured payment.
  return {
    customerId: input.customerId,
    contractId: input.contractId,
    journeyId: "monetaryRecharge",
    type: "PurchaseOrder",
    journeyData: {
      msisdn: input.communicationId,
      monetaryRechargeDetails: { amount: String(minorToDecimal(input.amountMinor)), unit: "EUR" },
      payment: { merchantRefNum: paymentId, paymentGwTransactionId: authorizationCode },
    },
  };
}
interface TmfInteractionResult {
  partyInteractionId?: string;
}
function fromTmfInteraction(json: unknown): string {
  const id = (json as TmfInteractionResult | null)?.partyInteractionId;
  if (!id) throw new Error("monetaryRecharge: missing partyInteractionId in response");
  return id;
}

/* ---- TMF654 bucket read mapping ---- */
interface TmfBucket {
  amount?: { unit?: string; value?: number };
  validFor?: { endDateTime?: string };
}
/**
 * The bucket list → domain Balance, or null when the line has no bucket yet. Exported so the
 * mapping (decimal EUR → minor, validFor → validUntil, empty → null) is unit-tested directly.
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

  /** POST/GET the recharge BFF, parse the envelope on non-2xx, map the 2xx body. Never throws. */
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

  return {
    // Bare getBalance can't key the TMF654 bucket without the MSISDN; the recharge op reads the
    // balance itself (it has the MSISDN). A customer→MSISDN resolution is a recorded follow-up.
    getBalance: (): Promise<SeamResult<Balance | null>> =>
      Promise.resolve(notConfigured<Balance | null>()),
    topUp: (): Promise<SeamResult<Balance>> => Promise.resolve(notConfigured<Balance>()),

    async recharge(input: RechargeInput): Promise<SeamResult<RechargeResult>> {
      // 1. Direct-capture payment. A fresh authorizationCode per call (the real API rejects a reused
      //    one with 33028). This is the charge — not a reserve. On conflict/rejection, stop.
      const authorizationCode = `Payer-AuthCode_${Date.now()}`;
      const paymentRes = await request(
        `/payment/v4/payment`,
        { method: "POST", body: JSON.stringify(toTmfPayment(input, authorizationCode)) },
        (json) => fromTmfPayment(json),
      );
      if (!paymentRes.ok) return paymentRes;

      // 2. monetaryRecharge journey — applies the recharge, referencing the captured payment. Per
      //    the DXP rule, capture precedes the journey (done above).
      const journeyRes = await request(
        `/xCACcore/v1/customerInteraction`,
        {
          method: "POST",
          body: JSON.stringify(
            toTmfMonetaryRecharge(
              input,
              paymentRes.data.paymentId,
              paymentRes.data.authorizationCode,
            ),
          ),
        },
        (json) => fromTmfInteraction(json),
      );
      if (!journeyRes.ok) return journeyRes;

      // 3. Balance after the recharge — the journey returns only a partyInteractionId, so read the
      //    TMF654 bucket (D-credit-no-balance). A failed read → balance null (runTopUp's fallback).
      const balanceRes = await request(
        `/bae/bssTmf654PrepayBalanceManagement/v1/bucket?communicationId=${encodeURIComponent(input.communicationId)}`,
        { method: "GET" },
        (json) => fromTmfBucket(json),
      );
      const balance = balanceRes.ok ? balanceRes.data : null;
      return ok({ partyInteractionId: journeyRes.data, balance });
    },

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
