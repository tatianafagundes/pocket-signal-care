import { ok, err, seamError } from "@/services/seam-result";
import type { Balance, UsageBucket, UsageUnit } from "@/services/model";
import type { TenantId } from "@/lib/tenant-rules";
import { withMock } from "@/services/mock-support";
import type { AllowanceGrant, ChargingDriver } from "@/services/charging/charging-driver";

/*
 * Charging (ECEV) mock driver. (Spec Fase 4.4 + usage buckets)
 *
 * Two axes of module-level state so actions stay visible in the 360 afterwards:
 *  - balances: customerId -> euro cents. topUp adds, rateAndDeduct subtracts (never negative).
 *  - usage: customerId -> UsageBucket[] (TMF654). getUsage reads; grantAllowance creates/refills a
 *    bucket on add-on fulfilment (same offerId ⇒ re-up, else a new bucket).
 * Top-up moves money only (decision A1): credit is not allowance. An add-on moves usage only.
 */

// customerId -> balance in minor units (euro cents).
const balances = new Map<string, number>();
// customerId -> allowance buckets (TMF654), the usage axis.
const usage = new Map<string, UsageBucket[]>();
let seeded = false;
let bucketSeq = 0;

/** ISO for `days` from now (negative = past). Keeps the seed's validity relative to "now". */
function isoFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function seed(): void {
  if (seeded) return;
  seeded = true;
  const tenants: TenantId[] = ["drei", "dreigo"];
  for (const tenantId of tenants) {
    const customerId = `demo-${tenantId}`;
    balances.set(customerId, 1500); // €15.00 starting balance
    // Plan offer id the demo customer onboarded on — correlates the seeded buckets to the plan
    // (= DMP productOfferingId). drei → "drei-up"; dreigo → "dreigo-go-8".
    const planOfferId = tenantId === "drei" ? "drei-up" : "dreigo-go-8";
    const planName = tenantId === "drei" ? "Drei Up" : "Go 8";
    usage.set(customerId, [
      // Data near the low threshold (1.8 of 10 GB = 18% ⇒ "low") so the demo shows the warning.
      bucket("data", 10, 1.8, "GB", planOfferId, planName, {
        start: isoFromNow(-5),
        end: isoFromNow(25),
      }),
      // Voice: healthy.
      bucket("voice", 500, 420, "min", planOfferId, planName, {
        start: isoFromNow(-5),
        end: isoFromNow(25),
      }),
      // SMS: healthy.
      bucket("sms", 200, 175, "sms", planOfferId, planName, {
        start: isoFromNow(-5),
        end: isoFromNow(25),
      }),
      // Roaming data: a smaller EU bucket.
      bucket("roaming", 2, 2, "GB", planOfferId, planName, {
        start: isoFromNow(-5),
        end: isoFromNow(25),
      }),
    ]);
  }
}

/** Build a metered bucket with a fresh id. */
function bucket(
  type: UsageBucket["type"],
  total: number,
  remaining: number,
  unit: UsageUnit,
  offerId: string,
  offerName: string,
  validFor: { start?: string; end?: string },
): UsageBucket {
  return {
    bucketId: `bkt-${++bucketSeq}`,
    type,
    unlimited: false,
    total: { value: total, unit },
    remaining: { value: remaining, unit },
    validFor,
    offerId,
    offerName,
  };
}

function toBalance(amountMinor: number): Balance {
  return { amountMinor, currency: "EUR", validUntil: "2026-12-31T23:59:59Z" };
}

export function createChargingMock(): ChargingDriver {
  seed();
  return {
    getBalance(customerId) {
      return withMock("charging.getBalance", () => {
        const amount = balances.get(customerId);
        // A customer with no balance record yet (brand-new) returns null, not zero.
        return ok(amount == null ? null : toBalance(amount));
      });
    },

    topUp(customerId, amountMinor) {
      return withMock("charging.topUp", () => {
        const current = balances.get(customerId) ?? 0;
        const next = current + amountMinor;
        balances.set(customerId, next);
        return ok(toBalance(next));
      });
    },

    rateAndDeduct(customerId, amountMinor) {
      // NOTE: the spec names this rateAndDeduct(orderId) — the real ECEV resolves the order's
      // charge internally (Fase 6 wires the buy flow). The mock deducts a given amount from a
      // given customer, refusing to go negative (insufficient balance is a domain error).
      return withMock("charging.rateAndDeduct", () => {
        const current = balances.get(customerId) ?? 0;
        if (amountMinor > current) {
          return err(seamError("charging.insufficientBalance", "rejected", "fixInput"));
        }
        balances.set(customerId, current - amountMinor);
        return ok({ ok: true as const });
      });
    },

    getUsage(customerId) {
      return withMock("charging.getUsage", () => {
        // Deep-ish copies so a caller can't mutate the mock's state through the returned buckets
        // (the nested total/remaining/validFor are objects — a shallow spread would share them).
        return ok((usage.get(customerId) ?? []).map(cloneBucket));
      });
    },

    grantAllowance(customerId, grant) {
      return withMock("charging.grantAllowance", () => {
        const buckets = usage.get(customerId) ?? [];
        const granted = applyGrant(buckets, grant);
        usage.set(customerId, buckets);
        return ok(cloneBucket(granted));
      });
    },
  };
}

/** A copy of a bucket that shares no mutable sub-object with the mock's stored state. */
function cloneBucket(b: UsageBucket): UsageBucket {
  return {
    ...b,
    ...(b.total ? { total: { ...b.total } } : {}),
    ...(b.remaining ? { remaining: { ...b.remaining } } : {}),
    ...(b.validFor ? { validFor: { ...b.validFor } } : {}),
  };
}

/**
 * Apply a grant to a customer's buckets IN PLACE, returning the created/refilled bucket. Refill
 * rule: an existing bucket with the same offerId is topped up (total + remaining both increase, so
 * a re-up of a partly-consumed bucket adds the new quota on top of what is left); otherwise a new
 * bucket is appended. Unlimited grants replace/keep an unlimited bucket (no numbers to add).
 */
function applyGrant(buckets: UsageBucket[], grant: AllowanceGrant): UsageBucket {
  const existing = buckets.find((b) => b.offerId === grant.offerId);

  if (grant.unlimited) {
    if (existing) {
      existing.unlimited = true;
      delete existing.total;
      delete existing.remaining;
      return existing;
    }
    const created: UsageBucket = {
      bucketId: `bkt-${++bucketSeq}`,
      type: grant.type,
      unlimited: true,
      offerId: grant.offerId,
      ...(grant.offerName !== undefined ? { offerName: grant.offerName } : {}),
      ...(grant.validFor !== undefined ? { validFor: grant.validFor } : {}),
    };
    buckets.push(created);
    return created;
  }

  // Metered grant. amount/unit are required by the schema for a non-unlimited grant.
  const amount = grant.amount ?? 0;
  const unit = grant.unit ?? "GB";

  if (existing && !existing.unlimited && existing.total && existing.remaining) {
    existing.total = { value: existing.total.value + amount, unit: existing.total.unit };
    existing.remaining = {
      value: existing.remaining.value + amount,
      unit: existing.remaining.unit,
    };
    if (grant.validFor !== undefined) existing.validFor = grant.validFor;
    return existing;
  }

  const created: UsageBucket = {
    bucketId: `bkt-${++bucketSeq}`,
    type: grant.type,
    unlimited: false,
    total: { value: amount, unit },
    remaining: { value: amount, unit },
    offerId: grant.offerId,
    ...(grant.offerName !== undefined ? { offerName: grant.offerName } : {}),
    ...(grant.validFor !== undefined ? { validFor: grant.validFor } : {}),
  };
  buckets.push(created);
  return created;
}
