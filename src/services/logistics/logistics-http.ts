import { err, seamError, type SeamResult } from "@/services/seam-result";
import type { DeliveryAddress } from "@/services/model";
import type { LogisticsDriver } from "@/services/logistics/logistics-driver";

/*
 * Logistics (TMF673) http driver — STUB. (Fase 7 / 8.2)
 * Real Address Management when VITE_LOGISTICS_DRIVER=http. Stays mock for the demo; minimal
 * stub until wired. Protocol mapping would live only here.
 */
export function createLogisticsHttp(): LogisticsDriver {
  const notConfigured = <T>(): SeamResult<T> =>
    err(
      seamError(
        "logistics.http.notConfigured",
        "unavailable",
        "contactSupport",
        "Logistics (TMF673) http driver selected but no endpoint is configured.",
      ),
    );
  type AddressResult = { addressId: string; address: DeliveryAddress };
  return {
    createAddress: (): Promise<SeamResult<AddressResult>> =>
      Promise.resolve(notConfigured<AddressResult>()),
    getAddress: (): Promise<SeamResult<AddressResult>> =>
      Promise.resolve(notConfigured<AddressResult>()),
  };
}
