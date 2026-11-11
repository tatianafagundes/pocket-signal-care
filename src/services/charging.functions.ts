import { seamError, type SeamResult } from "@/services/seam-result";
import { runRead, runWrite } from "@/services/seam-runtime";
import { driverFor } from "@/services/driver-config";
import type { Balance } from "@/services/model";
import { customerIdSchema, topUpSchema, deductSchema } from "@/schemas/charging";
import type { ChargingDriver } from "@/services/charging/charging-driver";
import { createChargingMock } from "@/services/charging/charging-mock";
import { createChargingHttp } from "@/services/charging/charging-http";

/*
 * Charging (ECEV) seam. (Spec Fase 4.4) getBalance / topUp / rateAndDeduct. Mock by default.
 * Amounts are minor units (euro cents). Same shape as the other seams.
 */

const driver: ChargingDriver =
  driverFor("ecev") === "http" ? createChargingHttp() : createChargingMock();

function invalid<T>(code: string): Promise<SeamResult<T>> {
  return Promise.resolve<SeamResult<T>>({
    ok: false,
    error: seamError(code, "validation", "fixInput"),
  });
}

export function getBalance(customerIdRaw: string): Promise<SeamResult<Balance | null>> {
  const parsed = customerIdSchema.safeParse(customerIdRaw);
  if (!parsed.success) return invalid<Balance | null>("charging.customer.invalid");
  return runRead({ tenantId: "ecev" }, "charging.getBalance", () => driver.getBalance(parsed.data));
}

export function topUp(input: unknown): Promise<SeamResult<Balance>> {
  const parsed = topUpSchema.safeParse(input);
  if (!parsed.success) return invalid<Balance>("charging.topUp.invalid");
  return runWrite({ tenantId: "ecev" }, "charging.topUp", () =>
    driver.topUp(parsed.data.customerId, parsed.data.amountMinor),
  );
}

export function rateAndDeduct(input: unknown): Promise<SeamResult<{ ok: true }>> {
  const parsed = deductSchema.safeParse(input);
  if (!parsed.success) return invalid<{ ok: true }>("charging.deduct.invalid");
  return runWrite({ tenantId: "ecev" }, "charging.rateAndDeduct", () =>
    driver.rateAndDeduct(parsed.data.customerId, parsed.data.amountMinor),
  );
}
