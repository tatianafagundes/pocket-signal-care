import { afterEach, describe, expect, it } from "vitest";

import {
  authorize,
  capturePayment,
  voidAuthorization,
  getPayment,
} from "@/services/payment.functions";
import { clearForcedError } from "@/services/mock-support";

afterEach(() => clearForcedError());

/*
 * Payment seam (mock) — Fase 7.2. Deterministic: a method token containing "4000" declines,
 * anything else authorizes. capture/void/getPayment are idempotent on the authorizationRef.
 * No PAN/CVV anywhere — the input is an opaque token.
 */

async function freshAuthRef(amountMinor = 1500): Promise<string> {
  const r = await authorize({
    customerId: "demo-drei",
    amountMinor,
    methodToken: "tok-visa-4242",
  });
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error("authorize failed in setup");
  return r.data.authorizationRef;
}

describe("payment seam (mock)", () => {
  it("authorizes a tokenized method (reserve, no charge)", async () => {
    const r = await authorize({
      customerId: "demo-drei",
      amountMinor: 1500,
      methodToken: "tok-visa-4242",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.status).toBe("authorized");
      expect(r.data.authorizationRef).toMatch(/^auth-/);
      expect(r.data.amountMinor).toBe(1500);
      expect(r.data.currency).toBe("EUR");
      expect(r.data.methodLabel).toBe("Visa ending 4242");
    }
  });

  it("declines a token containing 4000 (rejected, not retryable)", async () => {
    const r = await authorize({
      customerId: "demo-drei",
      amountMinor: 1500,
      methodToken: "tok-visa-4000",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("payment.cardDeclined");
      expect(r.error.category).toBe("rejected");
      expect(r.error.retryable).toBe(false);
    }
  });

  it("captures a prior authorization (charge at the milestone)", async () => {
    const ref = await freshAuthRef();
    const r = await capturePayment({ authorizationRef: ref });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.status).toBe("captured");
      expect(r.data.authorizationRef).toBe(ref);
    }
  });

  it("is idempotent on capture — capturing twice does not charge again", async () => {
    const ref = await freshAuthRef();
    const first = await capturePayment({ authorizationRef: ref });
    const second = await capturePayment({ authorizationRef: ref });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.data.status).toBe("captured");
      expect(second.data).toEqual(first.data);
    }
  });

  it("capturing an unknown ref is notFound", async () => {
    const r = await capturePayment({ authorizationRef: "auth-does-not-exist" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("payment.authorization.notFound");
      expect(r.error.category).toBe("notFound");
    }
  });

  it("voids an uncaptured authorization (compensation)", async () => {
    const ref = await freshAuthRef();
    const r = await voidAuthorization({ authorizationRef: ref });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.status).toBe("voided");
  });

  it("refuses to void an already-captured authorization (conflict)", async () => {
    const ref = await freshAuthRef();
    await capturePayment({ authorizationRef: ref });
    const r = await voidAuthorization({ authorizationRef: ref });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("payment.alreadyCaptured");
      expect(r.error.category).toBe("conflict");
    }
  });

  it("reads the current state of an authorization", async () => {
    const ref = await freshAuthRef();
    await capturePayment({ authorizationRef: ref });
    const r = await getPayment(ref);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.status).toBe("captured");
  });

  it("getPayment on an unknown ref is notFound", async () => {
    const r = await getPayment("auth-nope");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.category).toBe("notFound");
  });

  it("rejects malformed input (validation)", async () => {
    const r = await authorize({ customerId: "", amountMinor: -5, methodToken: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.category).toBe("validation");
  });
});
