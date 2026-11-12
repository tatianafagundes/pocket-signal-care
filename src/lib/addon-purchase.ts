import { api } from "@/services/api";

/*
 * Add-on purchase orchestration. (Spec Fase 6)
 *
 * Buying an add-on for an EXISTING customer reuses the order seam, exactly like onboarding adds
 * add-ons at activation:
 *
 *   createCart(customerId) → addItem({ cartId, offerId }) → submitOrder({ cartId })
 *
 * submitOrder provisions the add-on as a Product { kind: "add-on" } onto the customer's installed
 * base, so it then shows up in getCustomer360 (installedBase is fed by the order seam). This is the
 * honest model of "the customer now OWNS the add-on" — a thing you can see in the 360.
 *
 * Why no charging.rateAndDeduct here: charging is a pure prepaid ledger with no entitlement concept,
 * and the two seams share no order/charge key in the mock (rateAndDeduct takes customerId+amount,
 * not an orderId), so coupling them client-side would be a non-atomic two-write with no rollback.
 * The real ECEV resolves an order's charge internally — that belongs to the Fase 8 HTTP driver, not
 * a hand-rolled client orchestration. Affordability is gated BEFORE this call by qualifyOffer
 * (balance ≥ price); see the add-ons screen.
 *
 * Errors: each api.* call throws SeamFailure on a failed seam; this helper lets it propagate so the
 * caller (a react-query mutation) captures it for the UI. The cart is created fresh per call, so a
 * retry after a mid-sequence failure never double-adds the item (a failed submit leaves an orphan
 * cart in the mock, which is harmless — it's keyed by its own id and never resubmitted).
 */

/** Buy a single add-on for an existing customer. Returns the created orderId on success. */
export async function purchaseAddOn(customerId: string, offerId: string): Promise<string> {
  const cart = await api.createCart(customerId);
  await api.addItem({ cartId: cart.cartId, offerId });
  // No SIM and no delivery address for an add-on purchase — a bare cart submit.
  const order = await api.submitOrder({ cartId: cart.cartId });
  return order.orderId;
}
