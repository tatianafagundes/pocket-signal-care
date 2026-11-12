import type { TenantId } from "@/lib/tenant-rules";

/*
 * Current customer resolution. (demo scope)
 *
 * The app does not yet have a real authenticated session — onboarding creates a customer and then
 * resets, and `my-plan` is still a placeholder, so there is no persisted "who is logged in". For
 * screens that need an existing customer (the add-ons route, which qualifies offers against the
 * customer's balance), we resolve the seeded DEMO customer for the active tenant.
 *
 * This is the SINGLE place that decision lives. When a real session exists (Fase 8 — the login
 * route + a session store), replace the body here with the session's customerId and every caller
 * is correct without change. Do not scatter `demo-${tenant}` through the UI.
 */
export function currentCustomerId(tenant: TenantId): string {
  return `demo-${tenant}`;
}
