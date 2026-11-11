import { ok, err, seamError } from "@/services/seam-result";
import type { Balance } from "@/services/model";
import type { TenantId } from "@/lib/tenant-rules";
import { withMock } from "@/services/mock-support";
import type { ChargingDriver } from "@/services/charging/charging-driver";

/*
 * Charging (ECEV) mock driver. (Spec Fase 4.4)
 *
 * Per-customer prepaid balance, module-level so a top-up is visible in the 360 afterwards.
 * Seeds the demo customers with a starting balance (the balance the CPR mock used to seed
 * itself before Fase 4 — now in its rightful seam). topUp adds, rateAndDeduct subtracts
 * (refusing to go negative — insufficient balance is a domain error, not a crash).
 */

// customerId -> balance in minor units (euro cents).
const balances = new Map<string, number>();
let seeded = false;

function seed(): void {
  if (seeded) return;
  seeded = true;
  const tenants: TenantId[] = ["drei", "dreigo"];
  for (const tenantId of tenants) {
    balances.set(`demo-${tenantId}`, 1500); // €15.00 starting balance
  }
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
  };
}
