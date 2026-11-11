import { seamError, type SeamResult } from "@/services/seam-result";
import { runRead, runWrite } from "@/services/seam-runtime";
import { driverFor } from "@/services/driver-config";
import type { Product } from "@/services/model";
import { customerIdSchema, cartIdSchema, addItemSchema } from "@/schemas/order";
import type { OrderDriver } from "@/services/order/order-driver";
import { createOrderMock } from "@/services/order/order-mock";
import { createOrderHttp } from "@/services/order/order-http";

/*
 * Order (EOC) seam. (Spec Fase 4.3) createCart / addItem / submitOrder / getInstalledBase.
 * Mock by default. Same shape as CPR/catalog. Tenant isn't a direct input here (the cart is
 * customer-scoped), so logging uses the seam name as the tenant tag.
 */

const driver: OrderDriver = driverFor("eoc") === "http" ? createOrderHttp() : createOrderMock();

function invalid<T>(code: string): Promise<SeamResult<T>> {
  return Promise.resolve<SeamResult<T>>({
    ok: false,
    error: seamError(code, "validation", "fixInput"),
  });
}

export function createCart(customerIdRaw: string) {
  const parsed = customerIdSchema.safeParse(customerIdRaw);
  if (!parsed.success) return invalid<{ cartId: string }>("order.customer.invalid");
  return runWrite({ tenantId: "eoc" }, "order.createCart", () => driver.createCart(parsed.data));
}

export function addItem(input: unknown) {
  const parsed = addItemSchema.safeParse(input);
  if (!parsed.success) return invalid<{ cartId: string }>("order.addItem.invalid");
  return runWrite({ tenantId: "eoc" }, "order.addItem", () =>
    driver.addItem(parsed.data.cartId, parsed.data.offerId),
  );
}

export function submitOrder(cartIdRaw: string) {
  const parsed = cartIdSchema.safeParse(cartIdRaw);
  if (!parsed.success)
    return invalid<{ orderId: string; status: "completed" | "pending" }>("order.cart.invalid");
  return runWrite({ tenantId: "eoc" }, "order.submitOrder", () => driver.submitOrder(parsed.data));
}

export function getInstalledBase(customerIdRaw: string): Promise<SeamResult<Product[]>> {
  const parsed = customerIdSchema.safeParse(customerIdRaw);
  if (!parsed.success) return invalid<Product[]>("order.customer.invalid");
  return runRead({ tenantId: "eoc" }, "order.getInstalledBase", () =>
    driver.getInstalledBase(parsed.data),
  );
}
