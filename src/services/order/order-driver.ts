import type { SeamResult } from "@/services/seam-result";
import type { Product } from "@/services/model";

/*
 * OrderDriver (EOC) — the interface the mock and http client implement. (Spec Fase 4.3)
 * Cart → order → installed base. driverFor('eoc') picks the impl. Never throws → SeamResult.
 */
export interface OrderDriver {
  createCart(customerId: string): Promise<SeamResult<{ cartId: string }>>;
  addItem(cartId: string, offerId: string): Promise<SeamResult<{ cartId: string }>>;
  submitOrder(
    cartId: string,
  ): Promise<SeamResult<{ orderId: string; status: "completed" | "pending" }>>;
  /** The customer's provisioned products — what the Customer360 reads for installed base. */
  getInstalledBase(customerId: string): Promise<SeamResult<Product[]>>;
}
