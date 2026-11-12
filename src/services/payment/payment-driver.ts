import type { SeamResult } from "@/services/seam-result";
import type { PaymentResult } from "@/services/model";

/*
 * PaymentDriver (extensão paymentAuthorization) — the interface the mock and http client
 * implement. (Fase 7; dossiê newLine §3/§5.2.1)
 *
 * The three prepaid money moments live across two seams: this one does AUTHORIZE (reserve, no
 * charge) and CAPTURE (charge at the milestone); the CREDIT moment is the charging seam's topUp.
 * The card is tokenized before this seam sees it — `authorize` takes a `methodToken`, never a PAN.
 * driverFor('payment') picks the impl. Never throws → SeamResult.
 */
export interface PaymentDriver {
  /** Reserve `amountMinor` on the tokenized method WITHOUT charging. Returns an authorizationRef. */
  authorize(
    customerId: string,
    amountMinor: number,
    methodToken: string,
  ): Promise<SeamResult<PaymentResult>>;
  /** Capture (charge) a prior authorization at the milestone. Idempotent on the ref. */
  capture(authorizationRef: string): Promise<SeamResult<PaymentResult>>;
  /** Release an uncaptured authorization (compensation). Idempotent on the ref. */
  voidAuthorization(authorizationRef: string): Promise<SeamResult<PaymentResult>>;
  /** Read the current state of an authorization (resolve unknown / after-the-fact states). */
  getPayment(authorizationRef: string): Promise<SeamResult<PaymentResult>>;
}
