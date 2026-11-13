import type { TenantId } from "@/lib/tenant-rules";

/*
 * Demo variants — the single source of truth for the seeded demo lines that let the Customer 360
 * states be reviewed without real data. Each tenant has a base "healthy" demo customer plus one
 * extra line per non-healthy state. The CPR, order and charging mocks all seed from THIS list, so
 * the three stores stay consistent, and the dev-only demo switcher (Account screen) + the current-
 * customer resolver read the same ids. Mock-only; a real IdP/CPR replaces all of this (Fase 8).
 *
 * customerId convention: `demo-<tenant>` for healthy, `demo-<tenant>-<variant>` otherwise.
 */

/** The reviewable line states. "healthy" is the base demo; the rest exercise one state each. */
export type DemoVariant = "healthy" | "suspended" | "unlimited" | "expired" | "empty" | "pending";

export const DEMO_VARIANTS: DemoVariant[] = [
  "healthy",
  "suspended",
  "unlimited",
  "expired",
  "empty",
  "pending",
];

/** The customerId for a tenant + variant. Healthy has no suffix (the long-standing demo id). */
export function demoCustomerId(tenant: TenantId, variant: DemoVariant): string {
  return variant === "healthy" ? `demo-${tenant}` : `demo-${tenant}-${variant}`;
}

/** Parse a customerId back to its variant (healthy when no known suffix). null if not a demo id. */
export function demoVariantOf(customerId: string): DemoVariant | null {
  if (!customerId.startsWith("demo-")) return null;
  for (const v of DEMO_VARIANTS) {
    if (v !== "healthy" && customerId.endsWith(`-${v}`)) return v;
  }
  return "healthy";
}

/**
 * Per-variant seed spec the mocks consume. Only the deltas from the healthy line are expressed;
 * each mock applies the parts it owns (CPR: customer.status; order: plan status + unlimited offer;
 * charging: balance amount/validity + usage shape).
 */
export interface DemoVariantSpec {
  /** customer.status (CPR). */
  customerStatus: "active" | "pending" | "suspended";
  /** plan PRODUCT status (order) — "pending" drives lineStatus pending via the plan, not customer. */
  planStatus: "active" | "pending";
  /** Use the tenant's unlimited plan offer + an unlimited data bucket. */
  unlimitedData: boolean;
  /** Balance amount in minor units. */
  balanceMinor: number;
  /**
   * Balance validity relative to now, in days (negative = expired). null → no balance record at all
   * (balanceState "none"). The charging mock turns this into an absolute validUntil at seed time.
   */
  balanceValidDays: number | null;
  /** Seed the metered usage buckets (data/voice/sms/roaming). False → no usage (e.g. suspended). */
  seedUsage: boolean;
}

const HEALTHY: DemoVariantSpec = {
  customerStatus: "active",
  planStatus: "active",
  unlimitedData: false,
  balanceMinor: 1500,
  balanceValidDays: 49, // ~2026-12-31 from the original seed; comfortably in the future
  seedUsage: true,
};

export const DEMO_VARIANT_SPECS: Record<DemoVariant, DemoVariantSpec> = {
  healthy: HEALTHY,
  // Line suspended by the operator: status suspended, no balance left, usage paused (none shown).
  suspended: { ...HEALTHY, customerStatus: "suspended", balanceMinor: 0, seedUsage: false },
  // Unlimited-data plan: the ring/allowance show the word, not a number.
  unlimited: { ...HEALTHY, unlimitedData: true },
  // Balance whose validity has lapsed (balanceState "expired").
  expired: { ...HEALTHY, balanceValidDays: -3 },
  // Balance at zero but still valid (balanceState "empty") — the "top up to continue" path.
  empty: { ...HEALTHY, balanceMinor: 0 },
  // Line still activating: the plan product is pending (lineStatus "pending").
  pending: { ...HEALTHY, planStatus: "pending" },
};
