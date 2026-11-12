import type { SeamResult } from "@/services/seam-result";
import type { Product, SimChoice } from "@/services/model";

/*
 * OrderDriver (EOC) — the interface the mock and http client implement. (Spec Fase 4.3)
 * Cart → order → installed base. driverFor('eoc') picks the impl. Never throws → SeamResult.
 */
export interface OrderDriver {
  createCart(customerId: string): Promise<SeamResult<{ cartId: string }>>;
  addItem(cartId: string, offerId: string): Promise<SeamResult<{ cartId: string }>>;
  /**
   * Submit the cart as an order. `addressId` (physical SIM only) and `simType` ride on the order
   * so the provisioned SIM product records its form. (Fase 7.4)
   */
  submitOrder(
    cartId: string,
    opts?: { addressId?: string | undefined; simType?: SimChoice | undefined },
  ): Promise<SeamResult<{ orderId: string; status: "completed" | "pending" }>>;
  /** The customer's provisioned products — what the Customer360 reads for installed base. */
  getInstalledBase(customerId: string): Promise<SeamResult<Product[]>>;
}
