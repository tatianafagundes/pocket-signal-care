import { seamError, type SeamResult } from "@/services/seam-result";
import { runRead, runWrite } from "@/services/seam-runtime";
import { driverFor } from "@/services/driver-config";
import type { DeliveryAddress } from "@/services/model";
import { createAddressSchema, addressIdSchema } from "@/schemas/logistics";
import type { LogisticsDriver } from "@/services/logistics/logistics-driver";
import { createLogisticsMock } from "@/services/logistics/logistics-mock";
import { createLogisticsHttp } from "@/services/logistics/logistics-http";

/*
 * Logistics seam (TMF673 Geographic Address Management). (Fase 7 / dossiê newLine §3)
 *
 * The delivery address for a physical SIM is validated + persisted here; the order carries the
 * returned addressId. Mock by default. Same shape as the other seams.
 */

type AddressResult = { addressId: string; address: DeliveryAddress };

const driver: LogisticsDriver =
  driverFor("logistics") === "http" ? createLogisticsHttp() : createLogisticsMock();

function invalid<T>(code: string): Promise<SeamResult<T>> {
  return Promise.resolve<SeamResult<T>>({
    ok: false,
    error: seamError(code, "validation", "fixInput"),
  });
}

/** Validate + persist a delivery address. Returns the addressId the order references. */
export function createAddress(input: unknown): Promise<SeamResult<AddressResult>> {
  const parsed = createAddressSchema.safeParse(input);
  if (!parsed.success) return invalid<AddressResult>("logistics.createAddress.invalid");
  return runWrite({ tenantId: parsed.data.tenantId }, "logistics.createAddress", () =>
    driver.createAddress(parsed.data.customerId, parsed.data.tenantId, parsed.data.address),
  );
}

/** Read a persisted address by id. */
export function getAddress(addressIdRaw: unknown): Promise<SeamResult<AddressResult>> {
  const parsed = addressIdSchema.safeParse(addressIdRaw);
  if (!parsed.success) return invalid<AddressResult>("logistics.getAddress.invalid");
  return runRead({ tenantId: "logistics" }, "logistics.getAddress", () =>
    driver.getAddress(parsed.data),
  );
}
