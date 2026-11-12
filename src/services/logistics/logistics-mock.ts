import { ok, err, seamError } from "@/services/seam-result";
import type { DeliveryAddress } from "@/services/model";
import type { TenantId } from "@/lib/tenant-rules";
import { withMock } from "@/services/mock-support";
import type { LogisticsDriver } from "@/services/logistics/logistics-driver";

/*
 * Logistics (TMF673 Geographic Address Management) mock driver. (Fase 7)
 *
 * Validates + persists a delivery address and returns an addressId. Deterministic for the demo:
 * a country outside the serviced market, or a postal code starting with "00", is OUTSIDE the
 * delivery area and is rejected (rejected / fixInput) — the demo's address error path. Anything
 * else is accepted and stored module-level so getAddress can read it back idempotently.
 */

// addressId -> stored address.
const addresses = new Map<string, DeliveryAddress>();

function cryptoId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/** Serviced markets for the mock. The host is Austria; DreiGo rides the same footprint. */
const SERVICED_COUNTRIES = new Set(["AT"]);

function outsideDeliveryArea(address: DeliveryAddress): boolean {
  if (!SERVICED_COUNTRIES.has(address.country.toUpperCase())) return true;
  // Deterministic in-market trigger so the error path is reachable without changing country.
  if (address.postalCode.startsWith("00")) return true;
  return false;
}

export function createLogisticsMock(): LogisticsDriver {
  return {
    createAddress(_customerId, _tenantId, address) {
      return withMock("logistics.createAddress", () => {
        if (outsideDeliveryArea(address)) {
          return err(
            seamError(
              "logistics.addressOutsideDeliveryArea",
              "rejected",
              "fixInput",
              "We can't ship a physical SIM to that address.",
            ),
          );
        }
        const addressId = `addr-${cryptoId()}`;
        const stored: DeliveryAddress = { ...address };
        addresses.set(addressId, stored);
        return ok({ addressId, address: { ...stored } });
      });
    },

    getAddress(addressId) {
      return withMock("logistics.getAddress", () => {
        const stored = addresses.get(addressId);
        if (!stored) {
          return err(seamError("logistics.address.notFound", "notFound", "contactSupport"));
        }
        return ok({ addressId, address: { ...stored } });
      });
    },
  };
}
