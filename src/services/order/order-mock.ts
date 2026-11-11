import { ok, err, seamError } from "@/services/seam-result";
import type { Product } from "@/services/model";
import type { TenantId } from "@/lib/tenant-rules";
import { withMock } from "@/services/mock-support";
import type { OrderDriver } from "@/services/order/order-driver";

/*
 * Order (EOC) mock driver. (Spec Fase 4.3)
 *
 * In-memory carts + per-customer installed base, module-level so state survives the session
 * (add an offer, submit, then see the product in the 360). Submitting an order turns each cart
 * item into an "active" product on the customer's installed base. Seeds the demo customers'
 * installed base so the 360 shows a plan + SIM from the start (this is the data the CPR mock
 * used to seed itself before Fase 4 — now it lives in its rightful seam).
 */

interface Cart {
  cartId: string;
  customerId: string;
  offerIds: string[];
}

const carts = new Map<string, Cart>();
const installedBase = new Map<string, Product[]>();
let seeded = false;

function seed(): void {
  if (seeded) return;
  seeded = true;
  const tenants: TenantId[] = ["drei", "dreigo"];
  for (const tenantId of tenants) {
    const customerId = `demo-${tenantId}`;
    installedBase.set(customerId, [
      {
        productId: `${customerId}-plan`,
        offerId: `${tenantId}-plan-10gb`,
        name: "Prepaid 10 GB",
        kind: "plan",
        status: "active",
      },
      {
        productId: `${customerId}-sim`,
        offerId: `${tenantId}-sim`,
        name: "SIM",
        kind: "sim",
        status: "active",
      },
    ]);
  }
}

function cryptoId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/** Classify an offer id into a product kind (add-on offers contain "addon"/"roam"). */
function kindForOffer(offerId: string): Product["kind"] {
  if (/add-?on|roam|boost/i.test(offerId)) return "add-on";
  return "plan";
}

export function createOrderMock(): OrderDriver {
  seed();
  return {
    createCart(customerId) {
      return withMock("order.createCart", () => {
        const cartId = `cart-${cryptoId()}`;
        carts.set(cartId, { cartId, customerId, offerIds: [] });
        return ok({ cartId });
      });
    },

    addItem(cartId, offerId) {
      return withMock("order.addItem", () => {
        const cart = carts.get(cartId);
        if (!cart) return err(seamError("order.cart.notFound", "notFound", "retry"));
        cart.offerIds.push(offerId);
        return ok({ cartId });
      });
    },

    submitOrder(cartId) {
      return withMock("order.submitOrder", () => {
        const cart = carts.get(cartId);
        if (!cart) return err(seamError("order.cart.notFound", "notFound", "retry"));
        if (cart.offerIds.length === 0) {
          return err(seamError("order.cart.empty", "validation", "fixInput"));
        }
        // Provision each cart item as a product on the customer's installed base.
        const base = installedBase.get(cart.customerId) ?? [];
        for (const offerId of cart.offerIds) {
          base.push({
            productId: `prod-${cryptoId()}`,
            offerId,
            name: offerId,
            kind: kindForOffer(offerId),
            status: "active",
          });
        }
        installedBase.set(cart.customerId, base);
        carts.delete(cartId);
        return ok({ orderId: `order-${cryptoId()}`, status: "completed" as const });
      });
    },

    getInstalledBase(customerId) {
      return withMock("order.getInstalledBase", () =>
        ok((installedBase.get(customerId) ?? []).map((p) => ({ ...p }))),
      );
    },
  };
}
