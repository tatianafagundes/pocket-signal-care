import { ok, err, seamError } from "@/services/seam-result";
import type { PaymentResult } from "@/services/model";
import { withMock } from "@/services/mock-support";
import type { PaymentDriver } from "@/services/payment/payment-driver";

/*
 * Payment (extensão paymentAuthorization) mock driver. (Fase 7)
 *
 * Deterministic for the demo, mirroring the resource mock's ICCID convention: a method token
 * containing "4000" is DECLINED; anything else authorizes. No PAN/CVV ever reaches here — the
 * input is an opaque token from the (mock) tokenizer.
 *
 * Authorizations are held in a module-level Map keyed by authorizationRef, so capture / void /
 * getPayment are idempotent on the ref (calling capture twice returns the same captured result,
 * never a second charge — the dossiê's "Don't pay again" discipline at the seam level).
 */

interface AuthRecord {
  authorizationRef: string;
  amountMinor: number;
  methodToken: string;
  state: PaymentResult["status"];
}

const authorizations = new Map<string, AuthRecord>();

function cryptoId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/** Display label from the (mock) token, e.g. "tok-visa-4242" → "Visa ending 4242". Never a PAN. */
function methodLabelFor(methodToken: string): string {
  const last4 = methodToken.match(/(\d{4})(?!.*\d)/)?.[1];
  const brand = /visa/i.test(methodToken)
    ? "Visa"
    : /master|mc/i.test(methodToken)
      ? "Mastercard"
      : "Card";
  return last4 ? `${brand} ending ${last4}` : brand;
}

function toResult(rec: AuthRecord): PaymentResult {
  return {
    authorizationRef: rec.authorizationRef,
    amountMinor: rec.amountMinor,
    currency: "EUR",
    status: rec.state,
    methodLabel: methodLabelFor(rec.methodToken),
  };
}

export function createPaymentMock(): PaymentDriver {
  return {
    authorize(customerId, amountMinor, methodToken) {
      return withMock("payment.authorize", () => {
        // Deterministic decline for the demo error path.
        if (methodToken.includes("4000")) {
          return err(
            seamError(
              "payment.cardDeclined",
              "rejected",
              "fixInput",
              "The card was declined (demo: token contains 4000).",
            ),
          );
        }
        const authorizationRef = `auth-${cryptoId()}`;
        const rec: AuthRecord = {
          authorizationRef,
          amountMinor,
          methodToken,
          state: "authorized",
        };
        authorizations.set(authorizationRef, rec);
        return ok(toResult(rec));
      });
    },

    capture(authorizationRef) {
      return withMock("payment.capture", () => {
        const rec = authorizations.get(authorizationRef);
        if (!rec) {
          return err(seamError("payment.authorization.notFound", "notFound", "contactSupport"));
        }
        // Idempotent: capturing an already-captured ref returns the same result, no second charge.
        if (rec.state === "captured") return ok(toResult(rec));
        if (rec.state !== "authorized") {
          return err(
            seamError(
              "payment.notCapturable",
              "conflict",
              "contactSupport",
              `Authorization is ${rec.state}, cannot capture.`,
            ),
          );
        }
        rec.state = "captured";
        authorizations.set(authorizationRef, rec);
        return ok(toResult(rec));
      });
    },

    voidAuthorization(authorizationRef) {
      return withMock("payment.voidAuthorization", () => {
        const rec = authorizations.get(authorizationRef);
        // Voiding something unknown or already void is a no-op success (idempotent compensation).
        if (!rec) {
          return ok({
            authorizationRef,
            amountMinor: 0,
            currency: "EUR",
            status: "voided",
          });
        }
        if (rec.state === "captured") {
          return err(
            seamError(
              "payment.alreadyCaptured",
              "conflict",
              "contactSupport",
              "Already captured; a refund is needed, not a void.",
            ),
          );
        }
        rec.state = "voided";
        authorizations.set(authorizationRef, rec);
        return ok(toResult(rec));
      });
    },

    getPayment(authorizationRef) {
      return withMock("payment.getPayment", () => {
        const rec = authorizations.get(authorizationRef);
        if (!rec) {
          return err(seamError("payment.authorization.notFound", "notFound", "contactSupport"));
        }
        return ok(toResult(rec));
      });
    },
  };
}
