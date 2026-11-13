import { api } from "@/services/api";
import type { OnboardingPatch, OnboardingState } from "@/lib/onboarding-context";
import type { TenantId } from "@/lib/tenant-rules";
import type { AllowanceGrant } from "@/services/charging/charging-driver";

/*
 * Onboarding submit orchestration. (Spec Fase 5 / Req 7; Fase 7.4 adds the three money moments.)
 *
 * Runs the prepaid activation against the seams, in this order:
 *
 *   authorize (reserve, no charge)
 *     → createParty → createCustomer → createContract (prepaid, keyed by the reserved MSISDN)
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
 * THE THREE MONEY MOMENTS (dossiê newLine §4): authorize → capture → credit. What is paid today
 * is the plan price PLUS any extras ticked on Review; only the plan price is credited as the first
 * top-up (extras are order items, not balance). Money is minor units + EUR.
 *
 * IDEMPOTENT RETRY — "Don't pay again" (Req 7.3): every durable resource and every money
 * milestone is persisted via `patch` the instant its seam returns, and REUSED on a retry rather
 * than repeated:
 *   - authorizationRef : skip authorize if present
 *   - partyId / customerId / contractId : skip create if present
 *   - addressId / esimProfileId : skip the provisioning call if present
 *   - orderId : skip the ENTIRE cart→submit block if present (the cart is ephemeral; once an
 *       order exists, rebuilding a cart would double line items and re-provision)
 *   - captured / credited : skip capture / topUp if already done
 * So a retry after a mid-sequence failure never authorizes the card twice, never submits a second
 * order, never captures twice, never credits twice.
 *
 * The SIM is NOT a catalogue offer — it reuses the order seam's "<tenant>-sim-po" provisioning id.
 * The methodToken is an opaque (mock) payment token passed in by the caller; it is NEVER stored in
 * state, localStorage, or a log. submitOrder is synchronous in the mock (status "completed"); a
 * non-terminal real EOC status that needs polling is a Fase 8 concern. On any seam failure this
 * throws (the SeamFailure bubbles to the page); partial progress is persisted so a retry resumes.
 */

/** The orchestration steps, in order, for the progress announcement. */
export type SubmitStep =
  | "authorize"
  | "createParty"
  | "createCustomer"
  | "createContract"
  | "createAddress"
  | "requestEsim"
  | "createCart"
  | "addPlan"
  | "addSim"
  | "addAddOns"
  | "submitOrder"
  | "recordInteraction"
  | "capture"
  | "credit"
  | "grantAllowance";

function simOfferId(tenant: TenantId): string {
  return `${tenant}-sim-po`;
}

interface SubmitDeps {
  state: OnboardingState;
  patch: (patch: OnboardingPatch) => void;
  onStep: (step: SubmitStep) => void;
  /** First top-up amount = the plan price, in minor units (euro cents). */
  planPriceMinor: number;
  /** Sum of the ticked extras, in minor units. Paid today with the plan; never credited. */
  extrasMinor?: number;
  /** Opaque (mock) payment-method token. Never a PAN; never persisted. */
  methodToken: string;
  /**
   * The data allowance the chosen plan grants (TMF654 usage bucket), derived by the caller from
   * the resolved plan offer. Null when the plan's data label isn't a parseable quantity — then no
   * bucket is granted (entitlement only), never a fabricated one. Granted after the first top-up so
   * the newly activated line has its plan allowance, not an empty usage list.
   */
  planAllowance?: AllowanceGrant | null;
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
  extrasMinor = 0,
  methodToken,
  planAllowance = null,
}: SubmitDeps): Promise<string> {
  const { tenant, selectedOfferId, selectedAddOnIds, simType, email, givenName, familyName } =
    state;
  if (!selectedOfferId || !email || !givenName || !familyName) {
    throw new Error("onboarding-submit: called with incomplete state");
  }
  // Money boundary: a non-positive price must never reach authorize/topUp. The review screen
  // already gates Confirm on a resolved offer; this is the reusable-function backstop so NO caller
  // can silently activate a line for €0 (see Fase 7.4 review).
  if (!Number.isInteger(planPriceMinor) || planPriceMinor <= 0) {
    throw new Error("onboarding-submit: planPriceMinor must be a positive integer (minor units)");
  }
  if (!Number.isInteger(extrasMinor) || extrasMinor < 0) {
    throw new Error("onboarding-submit: extrasMinor must be a non-negative integer (minor units)");
  }

  // 1. Authorize FIRST — reserve plan + extras (what is paid today) on the tokenized method, no
  //    charge yet. Reuse an
  //    existing authorizationRef on retry (never authorize the card twice).
  let authorizationRef = state.authorizationRef;
  if (!authorizationRef) {
    onStep("authorize");
    const auth = await api.authorizePayment({
      customerId: state.customerId ?? `pending:${email}`,
      amountMinor: planPriceMinor + extrasMinor,
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

  // 3b. Contract (prepaid) — created AFTER the customer and BEFORE any order/fulfilment, so the
  //     prepaid contract (keyed by the reserved MSISDN) exists for the order to attach to and for
  //     the later recharge to reference. Idempotent: reuse state.contractId on retry (never create
  //     a second contract). communicationId is REQUIRED — onboarding reserves the MSISDN before
  //     review, so a missing one here is a broken precondition, not an expected path: fail rather
  //     than create a contract with an empty communicationId (which keys on nothing).
  let contractId = state.contractId;
  if (!contractId) {
    if (!state.reservedMsisdn) {
      throw new Error("onboarding-submit: contract step reached with no reserved MSISDN");
    }
    onStep("createContract");
    const contract = await api.createContract({
      tenantId: tenant,
      customerId,
      communicationId: state.reservedMsisdn,
      paymentContext: "PREPAID",
    });
    contractId = contract.contractId;
    patch({ contractId });
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
      addressId: addressId ?? undefined,
      simType: simType ?? undefined,
    });
    orderId = submitted.orderId;
    patch({ orderId });
  }

  // 5b. Party Interaction (TMF683) — "a successful party interaction is created with order
  //     fulfilment." Recorded once the order exists, referencing it (+ MSISDN) as TMF Related
  //     Entities. Idempotent: skip if one was already recorded (reuse the persisted interactionId
  //     on retry), so a resumed submit never double-logs. Tenant travels via the seam context.
  //     DECISION: placed at ORDER FULFILMENT (after submitOrder), not after the money settles — the
  //     interaction records that the line was fulfilled, matching the DXP model. If a later capture
  //     fails the interaction still stands (the order exists); a future void/refund flow would log
  //     its own compensating interaction rather than retract this one.
  if (!state.interactionId) {
    onStep("recordInteraction");
    const interaction = await api.createInteraction({
      tenantId: tenant,
      partyId,
      customerId,
      type: "onboarding",
      status: "completed",
      relatedEntities: {
        orderId,
        ...(state.reservedMsisdn ? { msisdn: state.reservedMsisdn } : {}),
      },
    });
    patch({ interactionId: interaction.interactionId });
  }

  // 6. Capture — charge the authorization at the milestone (mock: synchronous post-submit). The
  //    guard reads the PERSISTED `state.captured` at call time (not a local): this function is
  //    linear and never mutates `state`, so on a retry the persisted flag is what decides whether
  //    capture is skipped — that's what makes "never charge twice" hold across attempts.
  if (!state.captured) {
    onStep("capture");
    await api.capturePayment({ authorizationRef });
    patch({ captured: true });
  }

  // 7. Credit — the first top-up lands on the prepaid balance (the plan price). Same persisted-flag
  //    guard as capture (reads `state.credited`): a retry after credit already ran skips it, so the
  //    balance is never credited twice.
  if (!state.credited) {
    onStep("credit");
    await api.topUp({ customerId, amountMinor: planPriceMinor });
    patch({ credited: true });
  }

  // 8. Grant the plan's data allowance (TMF654 usage bucket) so the activated line shows its
  //    included data, not an empty "No data allowance yet". In real DMP, order fulfilment makes
  //    CBEV create the product bucket; here it's an explicit step after the order + credit succeed,
  //    mirroring the add-on purchase flow. Same persisted-flag guard as capture/credit: a retry
  //    after this ran skips it, so the allowance is never granted twice. A null grant (plan whose
  //    data label isn't a parseable quantity) simply skips — entitlement only, no fabricated bucket.
  if (planAllowance && !state.granted) {
    onStep("grantAllowance");
    await api.grantAllowance({ customerId, ...planAllowance });
    patch({ granted: true });
  }

  return customerId;
}
