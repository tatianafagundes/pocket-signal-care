import type { TenantId } from "@/lib/tenant-rules";

/*
 * React Query key factory — the single source of truth for every query key. (Code-review P1)
 *
 * Before this, keys were string literals copy-pasted across routes, and two of them drifted:
 * the add-ons page used ["add-ons", tenant, customerId] (per-customer, qualified) while the
 * onboarding review used ["add-ons", tenant] (no customer yet). Same root, different arity — an
 * invalidate aimed at one silently missed the other. Centralising the keys here makes every
 * scope explicit and typed, so that class of bug can't recur.
 *
 * Rules:
 * - `as const` on each tuple so the key's shape is a literal type, not string[].
 * - One named entry per distinct scope. The two add-ons scopes are deliberately separate names
 *   (`addOns` vs `addOnsOnboarding`) so the difference reads as intent, not accident.
 * - `customer360All()` is the prefix used to invalidate every customer360 query at once (the
 *   demo switcher flips the active customer and must drop all of them).
 */
export const queryKeys = {
  /** The Customer 360 fan-out for one customer under one tenant. */
  customer360: (tenant: TenantId, customerId: string) =>
    ["customer360", tenant, customerId] as const,
  /** Prefix for invalidating every customer360 query regardless of tenant/customer. */
  customer360All: () => ["customer360"] as const,

  /** Add-ons listed AND qualified against a specific customer's balance (the /add-ons page). */
  addOns: (tenant: TenantId, customerId: string) => ["add-ons", tenant, customerId] as const,
  /**
   * Add-ons listed during onboarding — there is no customer yet, so this is a tenant-only scope,
   * intentionally distinct from `addOns` above. Not a bug: a different thing is being cached.
   */
  addOnsOnboarding: (tenant: TenantId) => ["add-ons-onboarding", tenant] as const,
  /** Catalogue capability probe: does this tenant sell a roaming add-on? (My plan CTA gate.) */
  addOnsCatalog: (tenant: TenantId) => ["add-ons-catalog", tenant] as const,

  /** Plan offers for a tenant (onboarding plan/sim/review). */
  offers: (tenant: TenantId) => ["offers", tenant] as const,
  /** Available MSISDNs to reserve, for a tenant (onboarding number step). */
  msisdns: (tenant: TenantId) => ["msisdns", tenant] as const,
  /** A reserved eSIM profile by id (onboarding success). Id may be null while it resolves. */
  esimProfile: (esimProfileId: string | null) => ["esim-profile", esimProfileId] as const,
  /** A customer's auto top-up config (the /auto-top-up screen). */
  autoTopUp: (tenant: TenantId, customerId: string) => ["auto-top-up", tenant, customerId] as const,
} as const;
