import type { SeamError, SeamResult } from "@/services/seam-result";
import * as cpr from "@/services/cpr.functions";

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

export const api = {
  // CPR seam
  resolveTenant: (tenantId: string) => unwrap(cpr.resolveTenant(tenantId)),
  createParty: (input: unknown) => unwrap(cpr.createParty(input)),
  createCustomer: (input: unknown) => unwrap(cpr.createCustomer(input)),
  getCustomer360: (customerId: string) => unwrap(cpr.getCustomer360(customerId)),
};
