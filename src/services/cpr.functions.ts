import { seamError, type SeamResult } from "@/services/seam-result";
import { runRead, runWrite, seamCtx } from "@/services/seam-runtime";
import { newCorrelationId } from "@/services/seam-logger";
import { driverFor } from "@/services/driver-config";
import { composeCustomer360 } from "@/services/customer360-rules";
import type { TenantId } from "@/lib/tenant-rules";
import type { Customer360 } from "@/services/model";
import {
  partyInputSchema,
  customerInputSchema,
  createContractSchema,
  customerIdSchema,
  tenantIdSchema,
  createInteractionSchema,
} from "@/schemas/cpr";
import type { PartyInteraction } from "@/services/model";
import type { CprDriver } from "@/services/cpr/cpr-driver";
import { createCprMock } from "@/services/cpr/cpr-mock";
import { createCprHttp } from "@/services/cpr/cpr-http";
import { getInstalledBase } from "@/services/order.functions";
import { getBalance, getUsage, getActivity } from "@/services/charging.functions";
import { listOffers, listAddOns } from "@/services/catalog.functions";

/*
 * CPR seam. (Spec Fase 3.2)
 *
 * The public surface the app port (api.ts) calls. Each operation: validates its input (Zod),
 * runs through runRead/runWrite (never-throw + logging), and delegates to the active driver
 * (mock | http, chosen by VITE_CPR_DRIVER). getCustomer360 composes the three sources with the
 * PURE customer360-rules — composition is not in the connector. Returns canonical types only.
 */

// Resolve the driver once per module load. Swapping VITE_CPR_DRIVER swaps this with no other change.
const driver: CprDriver = driverFor("cpr") === "http" ? createCprHttp() : createCprMock();

export function resolveTenant(tenantIdRaw: string) {
  const parsed = tenantIdSchema.safeParse(tenantIdRaw);
  if (!parsed.success) {
    return Promise.resolve<SeamResult<never>>({
      ok: false,
      error: seamError("cpr.tenant.invalid", "validation", "fixInput"),
    });
  }
  const tenantId = parsed.data;
  return runRead({ tenantId }, "cpr.resolveTenant", () => driver.resolveTenant(tenantId));
}

export function createParty(input: unknown) {
  const parsed = partyInputSchema.safeParse(input);
  if (!parsed.success) {
    return Promise.resolve<SeamResult<never>>({
      ok: false,
      error: seamError("cpr.party.invalid", "validation", "fixInput"),
    });
  }
  return runWrite({ tenantId: parsed.data.tenantId }, "cpr.createParty", () =>
    driver.createParty(parsed.data),
  );
}

export function createCustomer(input: unknown) {
  const parsed = customerInputSchema.safeParse(input);
  if (!parsed.success) {
    return Promise.resolve<SeamResult<never>>({
      ok: false,
      error: seamError("cpr.customer.invalid", "validation", "fixInput"),
    });
  }
  return runWrite({ tenantId: parsed.data.tenantId }, "cpr.createCustomer", () =>
    driver.createCustomer(parsed.data),
  );
}

export function createContract(input: unknown) {
  const parsed = createContractSchema.safeParse(input);
  if (!parsed.success) {
    return Promise.resolve<SeamResult<never>>({
      ok: false,
      error: seamError("cpr.contract.invalid", "validation", "fixInput"),
    });
  }
  return runWrite({ tenantId: parsed.data.tenantId }, "cpr.createContract", () =>
    driver.createContract(parsed.data),
  );
}

export function getCustomer360(
  customerIdRaw: string,
  expectedTenant?: TenantId,
): Promise<SeamResult<Customer360>> {
  const parsed = customerIdSchema.safeParse(customerIdRaw);
  if (!parsed.success) {
    return Promise.resolve<SeamResult<Customer360>>({
      ok: false,
      error: seamError("cpr.customer.invalid", "validation", "fixInput"),
    });
  }
  const customerId = parsed.data;
  // The 360 fan-out lives HERE (not in a driver): CPR owns party+customer; the installed base
  // comes from the order (EOC) seam, and the balance and usage buckets from the charging (ECEV)
  // seam, enriched with the catalogue (ECM). Compose with the pure rule. If CPR fails, fail; if any
  // other source fails, degrade gracefully (empty base / null balance / empty usage / empty
  // catalogue) so the 360 still renders the customer rather than erroring out.
  // One correlation id for the whole fan-out: getCustomer360 and all its sub-reads log under the
  // SAME id, so an operator can see the 6 seam calls of one 360 request as a single group. This is
  // the request-scoped correlation the observability guidance calls for. (listInteractions calls
  // the driver directly — it doesn't go through a seam function, so it isn't logged; wiring it
  // through the cpr seam is a separate Fase-8 cleanup.)
  const cid = newCorrelationId();
  return runRead(seamCtx("cpr", cid), "cpr.getCustomer360", async () => {
    const cpr = await driver.getCustomerAndParty(customerId);
    if (!cpr.ok) return cpr;
    // The customer's tenant drives the catalogue fetch — known only after the CPR read resolves.
    const tenantId = cpr.data.customer.tenantId;

    // Defence-in-depth tenant check (NOT the real authorization boundary — that is server-side RLS,
    // Fase 8; see docs/design/2026-11-11-fase8-security-debt.md §1). The caller states which tenant it is acting for
    // (expectedTenant, from the active brand); if the resolved customer belongs to another tenant,
    // refuse rather than serve a cross-tenant 360. Reported as notFound so it never reveals that the
    // id exists under a different brand. Omitting expectedTenant (tests, server-internal) skips it.
    if (expectedTenant !== undefined && tenantId !== expectedTenant) {
      return {
        ok: false,
        error: seamError("cpr.customer.notFound", "notFound", "contactSupport"),
      };
    }

    const [baseRes, balanceRes, usageRes, activityRes, interactionsRes, offersRes, addOnsRes] =
      await Promise.all([
        getInstalledBase(customerId, cid),
        getBalance(customerId, cid),
        getUsage(customerId, cid),
        getActivity(customerId, cid),
        driver.listInteractions(customerId),
        listOffers(tenantId, cid),
        listAddOns(tenantId, cid),
      ]);
    // The RAW installed base (un-enriched Product[]); composeCustomer360 joins the catalogue onto
    // it to produce the enriched EnrichedProduct[] on Customer360.installedBase.
    const rawInstalledBase = baseRes.ok ? baseRes.data : [];
    const balance = balanceRes.ok ? balanceRes.data : null;
    // Usage (TMF654 buckets) degrades like balance: a failed ECEV usage read shows no buckets, not
    // an error — the money axis and the rest of the 360 still render.
    const usage = usageRes.ok ? usageRes.data : [];
    // Financial activity (money feed) degrades like usage: a failed read shows no recent activity,
    // not an error.
    const activity = activityRes.ok ? activityRes.data : [];
    // Interactions degrade gracefully like base/balance: a failed timeline must not blank the 360.
    const interactions = interactionsRes.ok ? interactionsRes.data : [];
    // Catalogue enrichment also degrades: if ECM fails, offers is empty and each product's `offer`
    // resolves to null (the screen falls back to the product's own name) — the 360 still renders.
    const offers = [
      ...(offersRes.ok ? offersRes.data : []),
      ...(addOnsRes.ok ? addOnsRes.data : []),
    ];

    return {
      ok: true,
      data: composeCustomer360({
        customer: cpr.data.customer,
        party: cpr.data.party,
        contract: cpr.data.contract,
        installedBase: rawInstalledBase,
        balance,
        usage,
        activity,
        interactions,
        offers,
      }),
    };
  });
}

/**
 * Record a Party Interaction (TMF683) for a customer — e.g. the onboarding fulfilment interaction.
 * The tenant travels through the seam context (the X-Tenant-Id equivalent) and is also validated
 * on the input, so the interaction is tenant-scoped end to end.
 */
export function createInteraction(input: unknown): Promise<SeamResult<PartyInteraction>> {
  const parsed = createInteractionSchema.safeParse(input);
  if (!parsed.success) {
    return Promise.resolve<SeamResult<PartyInteraction>>({
      ok: false,
      error: seamError("cpr.interaction.invalid", "validation", "fixInput"),
    });
  }
  return runWrite({ tenantId: parsed.data.tenantId }, "cpr.createInteraction", () =>
    driver.createInteraction(parsed.data),
  );
}

/** The customer's party interactions, newest first — the activity timeline. */
export function listInteractions(customerIdRaw: string): Promise<SeamResult<PartyInteraction[]>> {
  const parsed = customerIdSchema.safeParse(customerIdRaw);
  if (!parsed.success) {
    return Promise.resolve<SeamResult<PartyInteraction[]>>({
      ok: false,
      error: seamError("cpr.customer.invalid", "validation", "fixInput"),
    });
  }
  // Tenant label "cpr" matches every other per-customer read (getInstalledBase→"eoc" etc.); today
  // SeamContext.tenantId is log-only, so this is safe. TODO(Fase 8): when RLS lands, this read must
  // be tenant-scoped — derive the tenant from the customer (or take it as input) before querying.
  return runRead({ tenantId: "cpr" }, "cpr.listInteractions", () =>
    driver.listInteractions(parsed.data),
  );
}
