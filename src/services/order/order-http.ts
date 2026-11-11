import { err, seamError, type SeamResult } from "@/services/seam-result";
import type { Product } from "@/services/model";
import type { OrderDriver } from "@/services/order/order-driver";

/*
 * Order (EOC) http driver — STUB. (Spec Fase 4.3 / 8.2)
 * Real EOC (TMF663 cart / TMF622 order / TMF637 installed base) when VITE_EOC_DRIVER=http.
 * Stays mock for the demo; minimal stub until wired. TMF mapping would live only here.
 */
export function createOrderHttp(): OrderDriver {
  const notConfigured = <T>(): SeamResult<T> =>
    err(
      seamError(
        "order.http.notConfigured",
        "unavailable",
        "contactSupport",
        "EOC http driver selected but no endpoint is configured.",
      ),
    );
  return {
    createCart: () => Promise.resolve(notConfigured()),
    addItem: () => Promise.resolve(notConfigured()),
    submitOrder: () => Promise.resolve(notConfigured()),
    getInstalledBase: (): Promise<SeamResult<Product[]>> =>
      Promise.resolve(notConfigured<Product[]>()),
  };
}
