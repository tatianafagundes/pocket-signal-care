import { err, seamError, type SeamResult } from "@/services/seam-result";
import type { Offer } from "@/services/model";
import type { CatalogDriver } from "@/services/catalog/catalog-driver";

/*
 * Catalog (ECM) http driver — STUB. (Spec Fase 4.2 / 8.2)
 *
 * The real ECM (TMF620 catalog / TMF679 qualification) is reached when VITE_ECM_DRIVER=http.
 * ECM stays mock for the demo (only CPR is intended to go real), so this is a minimal stub:
 * it returns a clear "not configured" SeamError until a real endpoint is wired. The TMF620/679
 * mapping would live ONLY here. Kept deliberately small — not gold-plated.
 */
export function createCatalogHttp(): CatalogDriver {
  const notConfigured = <T>(): SeamResult<T> =>
    err(
      seamError(
        "catalog.http.notConfigured",
        "unavailable",
        "contactSupport",
        "ECM http driver selected but no endpoint is configured.",
      ),
    );

  return {
    listOffers(): Promise<SeamResult<Offer[]>> {
      return Promise.resolve(notConfigured<Offer[]>());
    },
    qualifyOffer() {
      return Promise.resolve(notConfigured());
    },
  };
}
