import { api } from "@/services/api";
import { allowanceGb } from "@/services/recommendation-rules";
import type { AllowanceGrant } from "@/services/charging/charging-driver";
import type { Offer } from "@/services/model";

/*
 * Add-on purchase orchestration. (Spec Fase 6 + usage buckets)
 *
 * Buying an add-on for an EXISTING customer reuses the order seam, exactly like onboarding adds
 * add-ons at activation:
 *
 *   createCart(customerId) → addItem({ cartId, offerId }) → submitOrder({ cartId })
 *   → grantAllowance(customerId, grant)   // the ECEV bucket the add-on fulfils
 *
 * submitOrder provisions the add-on as a Product { kind: "add-on" } onto the customer's installed
 * base (the ENTITLEMENT, visible in getCustomer360). Then grantAllowance tops up / creates the
 * TMF654 USAGE bucket the add-on grants, so the 360's usage numbers update. These are two axes:
 * owning the add-on (order/EOC) vs the allowance it grants (ECEV/TMF654). In real DMP, order
 * fulfilment makes CBEV create the product bucket; here the step is explicit and client-side so the
 * two mocks stay decoupled (the existing reasoning for not calling rateAndDeduct still holds — no
 * shared order/charge key). When the real ECEV lands, this grant step is deleted, not unwound.
 *
 * Affordability is gated BEFORE this call by qualifyOffer (balance ≥ price); see the add-ons screen.
 *
 * Errors: each api.* call throws SeamFailure on a failed seam; this helper lets it propagate so the
 * caller (a react-query mutation) captures it for the UI. The cart is created fresh per call, so a
 * retry after a mid-sequence failure never double-adds the item (a failed submit leaves an orphan
 * cart in the mock, which is harmless — it's keyed by its own id and never resubmitted).
 */

/**
 * Derive the allowance a data/roaming add-on grants from its catalogue Offer. Returns null when the
 * add-on grants no simple metered/unlimited bucket (e.g. a streaming pass whose dataAmount label is
 * not a parseable quantity) — such an add-on is an entitlement only, so no bucket is fabricated.
 *
 * Mapping: euRoaming add-on → roaming bucket; otherwise → data bucket. allowanceGb returns Infinity
 * for an unlimited add-on, a finite GB figure for a metered one, or null when the label is unparseable.
 */
export function allowanceGrantForAddOn(offer: Offer): AllowanceGrant | null {
  const gb = allowanceGb(offer);
  if (gb === null) return null;
  const type: AllowanceGrant["type"] = offer.euRoaming === true ? "roaming" : "data";
  const base = { type, offerId: offer.offerId, offerName: offer.name };
  if (gb === Number.POSITIVE_INFINITY) return { ...base, unlimited: true };
  return { ...base, amount: gb, unit: "GB" };
}

/**
 * Derive the data allowance a PLAN grants from its catalogue Offer — the bucket a newly activated
 * line starts with. Always a data bucket (a plan's data allowance): unlimited for an unlimited
 * plan, a finite GB figure for a metered one, or null when the plan's data label isn't a parseable
 * quantity (then no bucket is granted — entitlement only). Used by onboarding activation.
 */
export function allowanceGrantForPlan(offer: Offer): AllowanceGrant | null {
  const gb = allowanceGb(offer);
  if (gb === null) return null;
  const base = { type: "data" as const, offerId: offer.offerId, offerName: offer.name };
  if (gb === Number.POSITIVE_INFINITY) return { ...base, unlimited: true };
  return { ...base, amount: gb, unit: "GB" };
}

/** Buy a single add-on for an existing customer. Returns the created orderId on success. */
export async function purchaseAddOn(customerId: string, offer: Offer): Promise<string> {
  const cart = await api.createCart(customerId);
  await api.addItem({ cartId: cart.cartId, offerId: offer.offerId });
  // No SIM and no delivery address for an add-on purchase — a bare cart submit.
  const order = await api.submitOrder({ cartId: cart.cartId });

  // Fulfilment grants the ECEV usage bucket (when the add-on maps to one). Done after the order
  // succeeds, so a failed order never grants allowance. A null grant (entitlement-only add-on)
  // simply skips this step.
  const grant = allowanceGrantForAddOn(offer);
  if (grant !== null) {
    await api.grantAllowance({ customerId, ...grant });
  }

  return order.orderId;
}
