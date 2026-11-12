import { afterEach, describe, expect, it } from "vitest";

import { createCart, addItem, submitOrder, getInstalledBase } from "@/services/order.functions";
import { clearForcedError } from "@/services/mock-support";

afterEach(() => clearForcedError());

describe("order seam (mock)", () => {
  it("seeds the demo customer's installed base (plan + sim)", async () => {
    const r = await getInstalledBase("demo-drei");
    expect(r.ok).toBe(true);
    if (r.ok) {
      const kinds = r.data.map((p) => p.kind).sort();
      expect(kinds).toContain("plan");
      expect(kinds).toContain("sim");
    }
  });

  it("runs cart -> add -> submit, then the product is in the installed base", async () => {
    const customerId = "demo-dreigo";
    const before = await getInstalledBase(customerId);
    const beforeCount = before.ok ? before.data.length : 0;

    const cart = await createCart(customerId);
    expect(cart.ok).toBe(true);
    if (!cart.ok) return;

    const added = await addItem({ cartId: cart.data.cartId, offerId: "dreigo-go-8" });
    expect(added.ok).toBe(true);

    const order = await submitOrder({ cartId: cart.data.cartId });
    expect(order.ok).toBe(true);
    if (order.ok) expect(order.data.status).toBe("completed");

    const after = await getInstalledBase(customerId);
    expect(after.ok).toBe(true);
    if (after.ok) {
      expect(after.data.length).toBe(beforeCount + 1);
      expect(after.data.some((p) => p.offerId === "dreigo-go-8")).toBe(true);
    }
  });

  it("rejects submitting an empty cart and an unknown cart", async () => {
    const cart = await createCart("demo-drei");
    if (!cart.ok) return;
    const empty = await submitOrder({ cartId: cart.data.cartId });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error.code).toBe("order.cart.empty");

    const unknown = await submitOrder({ cartId: "cart-does-not-exist" });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.code).toBe("order.cart.notFound");
  });

  it("classifies an add-on offer by name", async () => {
    const customerId = "demo-drei";
    const cart = await createCart(customerId);
    if (!cart.ok) return;
    await addItem({ cartId: cart.data.cartId, offerId: "drei-roaming-addon" });
    await submitOrder({ cartId: cart.data.cartId });
    const base = await getInstalledBase(customerId);
    if (base.ok) {
      const addon = base.data.find((p) => p.offerId === "drei-roaming-addon");
      expect(addon?.kind).toBe("add-on");
    }
  });

  it("classifies a streaming pass as an add-on, not a plan", async () => {
    const customerId = "demo-dreigo";
    const cart = await createCart(customerId);
    if (!cart.ok) return;
    await addItem({ cartId: cart.data.cartId, offerId: "dreigo-stream-pass" });
    await submitOrder({ cartId: cart.data.cartId });
    const base = await getInstalledBase(customerId);
    if (base.ok) {
      const pass = base.data.find((p) => p.offerId === "dreigo-stream-pass");
      expect(pass?.kind).toBe("add-on");
    }
  });
});
