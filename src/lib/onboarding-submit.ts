import { api } from "@/services/api";
import type { OnboardingPatch, OnboardingState } from "@/lib/onboarding-context";
import type { TenantId } from "@/lib/tenant-rules";

/*
 * Onboarding submit orchestration. (Spec Fase 5 / Req 7)
 *
 * Runs the activation sequence against the seams:
 *   createParty → createCustomer → createCart → addItem(plan) → addItem(SIM) → submitOrder.
 *
 * IDEMPOTENT RETRY (Req 7.3): the durable resources — partyId and customerId — are persisted to
 * the wizard state as soon as the seam returns them, and REUSED on a retry rather than recreated,
 * so a retry never leaves a second orphan party/customer behind. The cart is deliberately NOT
 * reused: it is ephemeral and rebuilt fresh per attempt (see step 3) so line items can't double.
 *
 * submitOrder is synchronous in the mock (returns status "completed"); the real EOC may return a
 * non-terminal status that needs polling — that's a Fase 8 concern, flagged in tasks.md. On any
 * seam failure this throws (the SeamFailure bubbles to the page, which shows the terminal error);
 * partial progress is preserved in state so a retry resumes.
 *
 * The SIM is NOT a catalogue offer — it reuses the order seam's "<tenant>-sim-po" provisioning id.
 */

/** The orchestration steps, in order, for the progress announcement. */
export type SubmitStep =
  | "createParty"
  | "createCustomer"
  | "createCart"
  | "addPlan"
  | "addSim"
  | "addAddOns"
  | "submitOrder";

function simOfferId(tenant: TenantId): string {
  return `${tenant}-sim-po`;
}

interface SubmitDeps {
  state: OnboardingState;
  patch: (patch: OnboardingPatch) => void;
  onStep: (step: SubmitStep) => void;
}

/**
 * Run (or resume) the activation. Returns the customerId on success. Throws SeamFailure on any
 * step failure, with partial ids already persisted via `patch` for an idempotent retry.
 */
export async function runOnboardingSubmit({ state, patch, onStep }: SubmitDeps): Promise<string> {
  const { tenant, selectedOfferId, selectedAddOnIds, email, givenName, familyName } = state;
  if (!selectedOfferId || !email || !givenName || !familyName) {
    throw new Error("onboarding-submit: called with incomplete state");
  }

  // 1. Party — reuse if already created (idempotent retry).
  let partyId = state.partyId;
  if (!partyId) {
    onStep("createParty");
    const party = await api.createParty({ tenantId: tenant, givenName, familyName, email });
    partyId = party.partyId;
    patch({ partyId });
  }

  // 2. Customer — reuse if already created.
  let customerId = state.customerId;
  if (!customerId) {
    onStep("createCustomer");
    const customer = await api.createCustomer({ tenantId: tenant, partyId });
    customerId = customer.customerId;
    patch({ customerId });
  }

  // 3. Cart — always built FRESH per attempt. Unlike party/customer (which are durable resources
  //    we must not duplicate), the cart is ephemeral: addItem appends, and a retry that reused a
  //    partially-filled cart would add the plan/SIM twice. submitOrder consumes and deletes the
  //    cart, so a successful attempt leaves nothing to reuse anyway. We therefore create a new
  //    cart each time and fill it from scratch — no duplicate line items on retry.
  onStep("createCart");
  const cart = await api.createCart(customerId);
  const cartId = cart.cartId;
  patch({ cartId });

  // 4. Add the plan, then 5. the SIM provisioning item.
  onStep("addPlan");
  await api.addItem({ cartId, offerId: selectedOfferId });

  onStep("addSim");
  await api.addItem({ cartId, offerId: simOfferId(tenant) });

  // 5b. Add each optional add-on the user chose. The cart is fresh this attempt (see step 3), so
  //     this doesn't double on retry. Sequential (not parallel) to keep order deterministic.
  if (selectedAddOnIds.length > 0) {
    onStep("addAddOns");
    for (const offerId of selectedAddOnIds) {
      await api.addItem({ cartId, offerId });
    }
  }

  // 6. Submit — synchronous in the mock (status "completed").
  onStep("submitOrder");
  await api.submitOrder(cartId);

  return customerId;
}
