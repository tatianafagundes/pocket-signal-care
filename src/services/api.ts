import type { SeamError, SeamResult } from "@/services/seam-result";
import type { TenantId } from "@/lib/tenant-rules";
import * as cpr from "@/services/cpr.functions";
import * as catalog from "@/services/catalog.functions";
import * as order from "@/services/order.functions";
import * as charging from "@/services/charging.functions";
import * as resource from "@/services/resource.functions";
import * as auth from "@/services/auth.functions";
import * as payment from "@/services/payment.functions";
import * as logistics from "@/services/logistics.functions";
import * as preferences from "@/services/preferences.functions";

/*
 * api — the single port the UI uses. (Spec Fase 0.3 / 3.4)
 *
 * Screens import ONLY { api, SeamFailure } — never a seam function, never a driver, never TMF,
 * never fetch. Each api method unwraps a SeamResult: success returns the data, failure throws a
 * SeamFailure the UI catches and maps to copy (via error.customerKey / error.detail).
 *
 * unwrap + SeamFailure are copied verbatim from the telco-docs-compass pattern. New seams
 * (catalog/order/charging/resource — Fase 4) add their functions to this object; nothing else
 * in the UI changes.
 */

export class SeamFailure extends Error {
  readonly code: string;
  readonly category: SeamError["category"];
  readonly retryable: boolean;
  readonly customerKey: string;
  readonly detail: string | undefined;
  constructor(e: SeamError) {
    super(e.code);
    this.name = "SeamFailure";
    this.code = e.code;
    this.category = e.category;
    this.retryable = e.retryable;
    this.customerKey = e.customerFacing?.key ?? e.code;
    this.detail = e.customerFacing?.detail;
  }
}

/** The single place a `{ ok: false }` SeamResult becomes a thrown SeamFailure. */
async function unwrap<T>(r: Promise<SeamResult<T>>): Promise<T> {
  const result = await r;
  if (!result.ok) throw new SeamFailure(result.error);
  return result.data;
}

/**
 * Normalise a caught/query error into a SeamFailure for the UI. An error that is already a
 * SeamFailure (the common case — `api.*` throws them) passes through unchanged; anything else (a
 * non-seam throw surfaced by react-query) is wrapped as a retryable `unavailable` failure tagged
 * with the given seam `code`. Replaces the `error instanceof SeamFailure ? error : new SeamFailure(…)`
 * block that was copy-pasted into every query's error branch.
 */
export function asSeamFailure(error: unknown, code: string): SeamFailure {
  return error instanceof SeamFailure
    ? error
    : new SeamFailure({ code, category: "unavailable", retryable: true });
}

export const api = {
  // CPR seam (real-able)
  resolveTenant: (tenantId: string) => unwrap(cpr.resolveTenant(tenantId)),
  createParty: (input: unknown) => unwrap(cpr.createParty(input)),
  createCustomer: (input: unknown) => unwrap(cpr.createCustomer(input)),
  getCustomer360: (customerId: string, expectedTenant?: TenantId) =>
    unwrap(cpr.getCustomer360(customerId, expectedTenant)),
  createInteraction: (input: unknown) => unwrap(cpr.createInteraction(input)),
  listInteractions: (customerId: string) => unwrap(cpr.listInteractions(customerId)),

  // Catalog seam (ECM, mock)
  listOffers: (tenantId: string) => unwrap(catalog.listOffers(tenantId)),
  listAddOns: (tenantId: string) => unwrap(catalog.listAddOns(tenantId)),
  qualifyOffer: (offerId: string, ctx: unknown) => unwrap(catalog.qualifyOffer(offerId, ctx)),

  // Order seam (EOC, mock)
  createCart: (customerId: string) => unwrap(order.createCart(customerId)),
  addItem: (input: unknown) => unwrap(order.addItem(input)),
  submitOrder: (input: unknown) => unwrap(order.submitOrder(input)),
  getInstalledBase: (customerId: string) => unwrap(order.getInstalledBase(customerId)),

  // Charging seam (ECEV, mock)
  getBalance: (customerId: string) => unwrap(charging.getBalance(customerId)),
  topUp: (input: unknown) => unwrap(charging.topUp(input)),
  redeemVoucher: (input: unknown) => unwrap(charging.redeemVoucher(input)),
  rateAndDeduct: (input: unknown) => unwrap(charging.rateAndDeduct(input)),
  getUsage: (customerId: string) => unwrap(charging.getUsage(customerId)),
  grantAllowance: (input: unknown) => unwrap(charging.grantAllowance(input)),
  getActivity: (customerId: string) => unwrap(charging.getActivity(customerId)),

  // Resource seam (DSIMA, mock) — SIM/MSISDN + eSIM provisioning (esimProfile, GSMA SGP.22)
  listAvailableMsisdn: (tenantId: string) => unwrap(resource.listAvailableMsisdn(tenantId)),
  reserveMsisdn: (input: unknown) => unwrap(resource.reserveMsisdn(input)),
  validateSim: (iccid: string) => unwrap(resource.validateSim(iccid)),
  requestEsimProfile: (input: unknown) => unwrap(resource.requestEsimProfile(input)),
  getEsimProfile: (esimProfileId: string) => unwrap(resource.getEsimProfile(esimProfileId)),

  // Auth seam (mock + Keycloak stub) — register/login. Password never leaves the seam.
  register: (input: unknown) => unwrap(auth.registerAccount(input)),
  login: (input: unknown) => unwrap(auth.loginAccount(input)),
  changeEmail: (input: unknown) => unwrap(auth.changeAccountEmail(input)),

  // Payment seam (extensão paymentAuthorization, mock) — authorize/capture/void. No PAN here.
  authorizePayment: (input: unknown) => unwrap(payment.authorize(input)),
  capturePayment: (input: unknown) => unwrap(payment.capturePayment(input)),
  voidPayment: (input: unknown) => unwrap(payment.voidAuthorization(input)),
  getPayment: (authorizationRef: string) => unwrap(payment.getPayment(authorizationRef)),

  // Logistics seam (TMF673 Address Management, mock) — delivery address for a physical SIM.
  createAddress: (input: unknown) => unwrap(logistics.createAddress(input)),
  getAddress: (addressId: string) => unwrap(logistics.getAddress(addressId)),

  // Preferences seam (auto top-up opt-in state, mock) — DXP auto-recharge config per customer.
  getAutoTopUp: (customerId: string) => unwrap(preferences.getAutoTopUp(customerId)),
  setAutoTopUp: (input: unknown) => unwrap(preferences.setAutoTopUp(input)),
  disableAutoTopUp: (customerId: string) => unwrap(preferences.disableAutoTopUp(customerId)),
};
