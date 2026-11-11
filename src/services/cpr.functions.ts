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
import { getInstalledBase } from "@/services/order.functions";
import { getBalance } from "@/services/charging.functions";

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
  // The 360 fan-out lives HERE (not in a driver): CPR owns party+customer; the installed base
  // comes from the order (EOC) seam and the balance from the charging (ECEV) seam. Compose the
  // three with the pure rule. If CPR fails, fail; if order/charging fail, degrade gracefully
  // (empty base / null balance) so the 360 still renders the customer rather than erroring out.
  return runRead({ tenantId: "cpr" }, "cpr.getCustomer360", async () => {
    const cpr = await driver.getCustomerAndParty(customerId);
    if (!cpr.ok) return cpr;

    const [baseRes, balanceRes] = await Promise.all([
      getInstalledBase(customerId),
      getBalance(customerId),
    ]);
    const installedBase = baseRes.ok ? baseRes.data : [];
    const balance = balanceRes.ok ? balanceRes.data : null;

    return {
      ok: true,
      data: composeCustomer360({
        customer: cpr.data.customer,
        party: cpr.data.party,
        installedBase,
        balance,
      }),
    };
  });
}
