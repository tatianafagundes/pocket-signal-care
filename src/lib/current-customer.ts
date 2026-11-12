import { useSession } from "@/hooks/use-session";
import { useTenant } from "@/hooks/use-tenant";
import type { TenantId } from "@/lib/tenant-rules";

/*
 * Current customer resolution — the single place that answers "whose data do we show?".
 *
 * When there is a signed-in session (after onboarding auto-login, or a login), it is that
 * session's customerId. Otherwise it falls back to the seeded DEMO customer for the active tenant,
 * so the data screens still have something to show in the demo before anyone signs in.
 *
 * This hook is the ONE swap point. Do not scatter `demo-${tenant}` or read the session directly in
 * screens — call this. When a real IdP replaces the mock (Fase 8), the session already carries the
 * real customerId and this needs no change.
 */

/**
 * The demo customer seeded per tenant (charging-mock / order-mock) — the fallback "current
 * customer" before a real session exists, and the customerId a mock login resolves to (there is
 * no email→customer map yet). The one place `demo-${tenant}` is formed; callers use this.
 */
export function fallbackCustomerId(tenant: TenantId): string {
  return `demo-${tenant}`;
}

/** The current customer id: the session's when signed in, else the demo customer for the tenant. */
export function useCurrentCustomerId(): string {
  const { session } = useSession();
  const { tenant } = useTenant();
  return session?.customerId ?? fallbackCustomerId(tenant);
}
