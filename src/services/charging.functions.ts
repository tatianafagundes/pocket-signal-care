import { seamError, type SeamResult } from "@/services/seam-result";
import { runRead, runWrite, seamCtx } from "@/services/seam-runtime";
import { driverFor } from "@/services/driver-config";
import type {
  ActivityItem,
  Balance,
  RechargeResult,
  UsageBucket,
  VoucherRedemption,
} from "@/services/model";
import {
  customerIdSchema,
  topUpSchema,
  deductSchema,
  grantAllowanceSchema,
  redeemVoucherSchema,
  rechargeSchema,
} from "@/schemas/charging";
import type { ChargingDriver } from "@/services/charging/charging-driver";
import { createChargingMock } from "@/services/charging/charging-mock";
import { createChargingHttp } from "@/services/charging/charging-http";

/*
 * Charging (ECEV) seam. (Spec Fase 4.4 + usage buckets + activity) getBalance / topUp /
 * rateAndDeduct, the usage axis getUsage / grantAllowance (TMF654 product buckets), and the money
 * activity feed getActivity (real DMP: TMF654 Prepay Balance Management for top-ups/refills +
 * Financial Transaction Enquiry for payments/refunds/adjustments). Mock by default.
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

export function getBalance(
  customerIdRaw: string,
  correlationId?: string,
): Promise<SeamResult<Balance | null>> {
  const parsed = customerIdSchema.safeParse(customerIdRaw);
  if (!parsed.success) return invalid<Balance | null>("charging.customer.invalid");
  return runRead(seamCtx("ecev", correlationId), "charging.getBalance", () =>
    driver.getBalance(parsed.data),
  );
}

export function topUp(input: unknown): Promise<SeamResult<Balance>> {
  const parsed = topUpSchema.safeParse(input);
  if (!parsed.success) return invalid<Balance>("charging.topUp.invalid");
  return runWrite({ tenantId: "ecev" }, "charging.topUp", () =>
    driver.topUp(parsed.data.customerId, parsed.data.amountMinor),
  );
}

export function recharge(input: unknown): Promise<SeamResult<RechargeResult>> {
  const parsed = rechargeSchema.safeParse(input);
  if (!parsed.success) return invalid<RechargeResult>("charging.recharge.invalid");
  return runWrite({ tenantId: "ecev" }, "charging.recharge", () => driver.recharge(parsed.data));
}

export function redeemVoucher(input: unknown): Promise<SeamResult<VoucherRedemption>> {
  const parsed = redeemVoucherSchema.safeParse(input);
  if (!parsed.success) return invalid<VoucherRedemption>("charging.redeemVoucher.invalid");
  return runWrite({ tenantId: "ecev" }, "charging.redeemVoucher", () =>
    driver.redeemVoucher(parsed.data.customerId, parsed.data.code),
  );
}

export function rateAndDeduct(input: unknown): Promise<SeamResult<{ ok: true }>> {
  const parsed = deductSchema.safeParse(input);
  if (!parsed.success) return invalid<{ ok: true }>("charging.deduct.invalid");
  return runWrite({ tenantId: "ecev" }, "charging.rateAndDeduct", () =>
    driver.rateAndDeduct(parsed.data.customerId, parsed.data.amountMinor),
  );
}

export function getUsage(
  customerIdRaw: string,
  correlationId?: string,
): Promise<SeamResult<UsageBucket[]>> {
  const parsed = customerIdSchema.safeParse(customerIdRaw);
  if (!parsed.success) return invalid<UsageBucket[]>("charging.customer.invalid");
  return runRead(seamCtx("ecev", correlationId), "charging.getUsage", () =>
    driver.getUsage(parsed.data),
  );
}

export function grantAllowance(input: unknown): Promise<SeamResult<UsageBucket>> {
  const parsed = grantAllowanceSchema.safeParse(input);
  if (!parsed.success) return invalid<UsageBucket>("charging.grantAllowance.invalid");
  const { customerId, ...grant } = parsed.data;
  return runWrite({ tenantId: "ecev" }, "charging.grantAllowance", () =>
    driver.grantAllowance(customerId, grant),
  );
}

export function getActivity(
  customerIdRaw: string,
  correlationId?: string,
): Promise<SeamResult<ActivityItem[]>> {
  const parsed = customerIdSchema.safeParse(customerIdRaw);
  if (!parsed.success) return invalid<ActivityItem[]>("charging.customer.invalid");
  return runRead(seamCtx("ecev", correlationId), "charging.getActivity", () =>
    driver.getActivity(parsed.data),
  );
}
