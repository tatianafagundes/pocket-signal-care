import { seamError, type SeamResult } from "@/services/seam-result";
import { runRead, runWrite } from "@/services/seam-runtime";
import { driverFor } from "@/services/driver-config";
import { composeCustomer360 } from "@/services/customer360-rules";
import type { Customer360 } from "@/services/model";
import {
  partyInputSchema,
  customerInputSchema,
  customerIdSchema,
  tenantIdSchema,
} from "@/schemas/cpr";
import type { CprDriver } from "@/services/cpr/cpr-driver";
import { createCprMock } from "@/services/cpr/cpr-mock";
import { createCprHttp } from "@/services/cpr/cpr-http";

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

export function getCustomer360(customerIdRaw: string): Promise<SeamResult<Customer360>> {
  const parsed = customerIdSchema.safeParse(customerIdRaw);
  if (!parsed.success) {
    return Promise.resolve<SeamResult<Customer360>>({
      ok: false,
      error: seamError("cpr.customer.invalid", "validation", "fixInput"),
    });
  }
  const customerId = parsed.data;
  // tenantId for logging is taken from the composed customer once fetched; use a placeholder
  // until then (the 360 read is tenant-scoped by the customer record itself).
  return runRead({ tenantId: "cpr" }, "cpr.getCustomer360", async () => {
    const parts = await driver.getCustomer360Parts(customerId);
    if (!parts.ok) return parts;
    return { ok: true, data: composeCustomer360(parts.data) };
  });
}
