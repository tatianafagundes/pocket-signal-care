import { err, seamError, type SeamResult } from "@/services/seam-result";
import type { PaymentResult } from "@/services/model";
import type { PaymentDriver } from "@/services/payment/payment-driver";

/*
 * Payment http driver — STUB. (Fase 7 / 8.2)
 * The real payment gateway (PSP via extensão paymentAuthorization + TMF676) when
 * VITE_PAYMENT_DRIVER=http. Stays mock for the demo; minimal stub until wired. The real driver
 * tokenizes via the PSP's hosted fields, handles 3-D Secure, and never sees the PAN — protocol
 * mapping would live only here.
 */
export function createPaymentHttp(): PaymentDriver {
  const notConfigured = <T>(): SeamResult<T> =>
    err(
      seamError(
        "payment.http.notConfigured",
        "unavailable",
        "contactSupport",
        "Payment http driver selected but no PSP endpoint is configured.",
      ),
    );
  return {
    authorize: (): Promise<SeamResult<PaymentResult>> =>
      Promise.resolve(notConfigured<PaymentResult>()),
    capture: (): Promise<SeamResult<PaymentResult>> =>
      Promise.resolve(notConfigured<PaymentResult>()),
    voidAuthorization: (): Promise<SeamResult<PaymentResult>> =>
      Promise.resolve(notConfigured<PaymentResult>()),
    getPayment: (): Promise<SeamResult<PaymentResult>> =>
      Promise.resolve(notConfigured<PaymentResult>()),
  };
}
