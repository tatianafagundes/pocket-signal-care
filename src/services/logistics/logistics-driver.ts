import type { SeamResult } from "@/services/seam-result";
import type { DeliveryAddress } from "@/services/model";
import type { TenantId } from "@/lib/tenant-rules";

/*
 * LogisticsDriver (TMF673 Geographic Address Management) — the interface the mock and http client
 * implement. (Fase 7; dossiê newLine §3 physical-SIM fulfilment.)
 *
 * createAddress validates + persists a delivery address for a physical SIM and returns an
 * addressId the order carries; getAddress reads it back. driverFor('logistics') picks the impl.
 * Never throws → SeamResult.
 */
export interface LogisticsDriver {
  /** Validate + persist a delivery address. Returns the addressId the order references. */
  createAddress(
    customerId: string,
    tenantId: TenantId,
    address: DeliveryAddress,
  ): Promise<SeamResult<{ addressId: string; address: DeliveryAddress }>>;
  /** Read a persisted address by id. */
  getAddress(
    addressId: string,
  ): Promise<SeamResult<{ addressId: string; address: DeliveryAddress }>>;
}
