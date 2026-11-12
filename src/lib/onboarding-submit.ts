import { api } from "@/services/api";
import type { OnboardingPatch, OnboardingState } from "@/lib/onboarding-context";
import type { TenantId } from "@/lib/tenant-rules";

/*
 * Onboarding submit orchestration. (Spec Fase 5 / Req 7; Fase 7.4 adds the three money moments.)
 *
 * Runs the prepaid activation against the seams, in this order:
 *
 *   authorize (reserve, no charge)
 *     → createParty → createCustomer
 *     → if physical: createAddress (TMF673) | if eSIM: requestEsimProfile
 *     → createCart → addItem(plan) → addItem(SIM|eSIM) → addItem(add-ons)
 *     → submitOrder({ addressId?, simType })   (capture the orderId)
 *     → capture (charge at the milestone; mock: synchronous post-submit)
 *     → topUp (credit the first top-up onto the prepaid balance)
 *
 * WHY AUTHORIZE FIRST: a declined card must cost nothing downstream — no orphan party, customer,
 * or order. If authorize fails we stop before touching CPR. (Matches "authorize at the order" in
 * the dossiê and design-review B-items.)
 *
 * THE THREE MONEY MOMENTS (dossiê newLine §4): authorize → capture → credit. The first top-up is
 * the plan price (same money, no separate free-amount step). Money is minor units + EUR.
 *
 * IDEMPOTENT RETRY — "Don't pay again" (Req 7.3): every durable resource and every money
 * milestone is persisted via `patch` the instant its seam returns, and REUSED on a retry rather
 * than repeated:
 *   - authorizationRef : skip authorize if present
 *   - partyId / customerId : skip create if present
 *   - addressId / esimProfileId : skip the provisioning call if present
 *   - orderId : skip the ENTIRE cart→submit block if present (the cart is ephemeral; once an
 *       order exists, rebuilding a cart would double line items and re-provision)
 *   - captured / credited : skip capture / topUp if already done
 * So a retry after a mid-sequence failure never authorizes the card twice, never submits a second
 * order, never captures twice, never credits twice.
 *
 * The SIM is NOT a catalogue offer — it reuses the order seam's "<tenant>-sim-po" provisioning id.
 * The methodToken is an opaque (mock) payment token passed in by the caller; it is NEVER stored in
 * state, sessionStorage, or a log. submitOrder is synchronous in the mock (status "completed"); a
 * non-terminal real EOC status that needs polling is a Fase 8 concern. On any seam failure this
 * throws (the SeamFailure bubbles to the page); partial progress is persisted so a retry resumes.
 */

/** The orchestration steps, in order, for the progress announcement. */
export type SubmitStep =
  | "authorize"
  | "createParty"
  | "createCustomer"
  | "createAddress"
  | "requestEsim"
  | "createCart"
  | "addPlan"
  | "addSim"
  | "addAddOns"
  | "submitOrder"
  | "capture"
  | "credit";

function simOfferId(tenant: TenantId): string {
  return `${tenant}-sim-po`;
}

interface SubmitDeps {
  state: OnboardingState;
  patch: (patch: OnboardingPatch) => void;
  onStep: (step: SubmitStep) => void;
  /** First top-up amount = the plan price, in minor units (euro cents). */
  planPriceMinor: number;
  /** Opaque (mock) payment-method token. Never a PAN; never persisted. */
  methodToken: string;
}

/**
 * Run (or resume) the activation. Returns the customerId on success. Throws SeamFailure on any
 * step failure, with partial ids/milestones already persisted via `patch` for an idempotent retry.
 */
export async function runOnboardingSubmit({
  state,
  patch,
  onStep,
  planPriceMinor,
  methodToken,
}: SubmitDeps): Promise<string> {
  const { tenant, selectedOfferId, selectedAddOnIds, simType, email, givenName, familyName } =
    state;
  if (!selectedOfferId || !email || !givenName || !familyName) {
    throw new Error("onboarding-submit: called with incomplete state");
  }

  // 1. Authorize FIRST — reserve the plan price on the tokenized method, no charge yet. Reuse an
  //    existing authorizationRef on retry (never authorize the card twice).
  let authorizationRef = state.authorizationRef;
  if (!authorizationRef) {
    onStep("authorize");
    const auth = await api.authorizePayment({
      customerId: state.customerId ?? `pending:${email}`,
      amountMinor: planPriceMinor,
      methodToken,
    });
    authorizationRef = auth.authorizationRef;
    patch({ authorizationRef });
  }

  // 2. Party — reuse if already created (idempotent retry).
  let partyId = state.partyId;
  if (!partyId) {
    onStep("createParty");
    const party = await api.createParty({ tenantId: tenant, givenName, familyName, email });
    partyId = party.partyId;
    patch({ partyId });
  }

  // 3. Customer — reuse if already created.
  let customerId = state.customerId;
  if (!customerId) {
    onStep("createCustomer");
    const customer = await api.createCustomer({ tenantId: tenant, partyId });
    customerId = customer.customerId;
    patch({ customerId });
  }

  // 4. Fulfilment resource for the chosen SIM form. Physical → a delivery address (TMF673);
  //    eSIM → an eSIM profile. Both idempotent: reuse the stored id on retry.
  let addressId = state.addressId;
  let esimProfileId = state.esimProfileId;
  if (simType === "physical" && !addressId) {
    if (!state.deliveryAddress) {
      throw new Error("onboarding-submit: physical SIM with no delivery address");
    }
    onStep("createAddress");
    const created = await api.createAddress({
      customerId,
      tenantId: tenant,
      address: state.deliveryAddress,
    });
    addressId = created.addressId;
    patch({ addressId });
  } else if (simType === "esim" && !esimProfileId) {
    onStep("requestEsim");
    const profile = await api.requestEsimProfile({ customerId, tenantId: tenant });
    esimProfileId = profile.esimProfileId;
    patch({ esimProfileId });
  }

  // 5. Order — the WHOLE cart→submit block is skipped once an orderId exists (the cart is
  //    ephemeral and rebuilding it would double line items / re-provision). Otherwise build a
  //    fresh cart each attempt and fill it from scratch.
  let orderId = state.orderId;
  if (!orderId) {
    onStep("createCart");
    const cart = await api.createCart(customerId);
    const cartId = cart.cartId;
    patch({ cartId });

    onStep("addPlan");
    await api.addItem({ cartId, offerId: selectedOfferId });

    onStep("addSim");
    await api.addItem({ cartId, offerId: simOfferId(tenant) });

    if (selectedAddOnIds.length > 0) {
      onStep("addAddOns");
      for (const offerId of selectedAddOnIds) {
        await api.addItem({ cartId, offerId });
      }
    }

    onStep("submitOrder");
    const submitted = await api.submitOrder({
      cartId,
      ...(addressId ? { addressId } : {}),
      ...(simType ? { simType } : {}),
    });
    orderId = submitted.orderId;
    patch({ orderId });
  }

  // 6. Capture — charge the authorization at the milestone (mock: synchronous post-submit). Skip
  //    if already captured (never charge twice).
  if (!state.captured) {
    onStep("capture");
    await api.capturePayment({ authorizationRef });
    patch({ captured: true });
  }

  // 7. Credit — the first top-up lands on the prepaid balance (the plan price). Skip if already
  //    credited (never credit twice).
  if (!state.credited) {
    onStep("credit");
    await api.topUp({ customerId, amountMinor: planPriceMinor });
    patch({ credited: true });
  }

  return customerId;
}
