import { seamError, type SeamResult } from "@/services/seam-result";
import { runRead, runWrite } from "@/services/seam-runtime";
import { driverFor } from "@/services/driver-config";
import type { PaymentResult } from "@/services/model";
import { authorizeSchema, captureSchema, voidSchema } from "@/schemas/payment";
import type { PaymentDriver } from "@/services/payment/payment-driver";
import { createPaymentMock } from "@/services/payment/payment-mock";
import { createPaymentHttp } from "@/services/payment/payment-http";

/*
 * Payment seam (extensão paymentAuthorization + TMF676). (Fase 7 / dossiê newLine §3, §5.2.1)
 *
 * The prepaid money is authorized here (reserve, no charge) and captured here (charge at the
 * milestone); the CREDIT moment is charging.topUp. Mock by default. The card never reaches this
 * seam as a PAN — the input carries an opaque method token. Same shape as the other seams.
 */

const driver: PaymentDriver =
  driverFor("payment") === "http" ? createPaymentHttp() : createPaymentMock();

function invalid<T>(code: string): Promise<SeamResult<T>> {
  return Promise.resolve<SeamResult<T>>({
    ok: false,
    error: seamError(code, "validation", "fixInput"),
  });
}

/** Reserve the amount on the tokenized method WITHOUT charging. Returns an authorizationRef. */
export function authorize(input: unknown): Promise<SeamResult<PaymentResult>> {
  const parsed = authorizeSchema.safeParse(input);
  if (!parsed.success) return invalid<PaymentResult>("payment.authorize.invalid");
  return runWrite({ tenantId: "payment" }, "payment.authorize", () =>
    driver.authorize(parsed.data.customerId, parsed.data.amountMinor, parsed.data.methodToken),
  );
}

/** Capture (charge) a prior authorization at the milestone. Idempotent on the ref. */
export function capturePayment(input: unknown): Promise<SeamResult<PaymentResult>> {
  const parsed = captureSchema.safeParse(input);
  if (!parsed.success) return invalid<PaymentResult>("payment.capture.invalid");
  return runWrite({ tenantId: "payment" }, "payment.capture", () =>
    driver.capture(parsed.data.authorizationRef),
  );
}

/** Release an uncaptured authorization (compensation). Idempotent on the ref. */
export function voidAuthorization(input: unknown): Promise<SeamResult<PaymentResult>> {
  const parsed = voidSchema.safeParse(input);
  if (!parsed.success) return invalid<PaymentResult>("payment.void.invalid");
  return runWrite({ tenantId: "payment" }, "payment.voidAuthorization", () =>
    driver.voidAuthorization(parsed.data.authorizationRef),
  );
}

/** Read the current state of an authorization. */
export function getPayment(authorizationRefRaw: string): Promise<SeamResult<PaymentResult>> {
  const parsed = voidSchema.safeParse({ authorizationRef: authorizationRefRaw });
  if (!parsed.success) return invalid<PaymentResult>("payment.getPayment.invalid");
  return runRead({ tenantId: "payment" }, "payment.getPayment", () =>
    driver.getPayment(parsed.data.authorizationRef),
  );
}
