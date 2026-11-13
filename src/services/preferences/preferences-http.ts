import { err, seamError, type SeamResult } from "@/services/seam-result";
import type { AutoTopUpConfig } from "@/services/model";
import type { PreferencesDriver } from "@/services/preferences/preferences-driver";

/*
 * Preferences (auto top-up) http driver — STUB.
 * Real DXP auto-recharge state + payment agreement when VITE_PREFERENCES_DRIVER=http. Stays mock
 * for the demo; minimal stub until wired. TMF/DXP mapping would live only here.
 */
export function createPreferencesHttp(): PreferencesDriver {
  const notConfigured = <T>(): SeamResult<T> =>
    err(
      seamError(
        "preferences.http.notConfigured",
        "unavailable",
        "contactSupport",
        "Preferences http driver selected but no endpoint is configured.",
      ),
    );
  return {
    getAutoTopUp: (): Promise<SeamResult<AutoTopUpConfig | null>> =>
      Promise.resolve(notConfigured<AutoTopUpConfig | null>()),
    setAutoTopUp: (): Promise<SeamResult<AutoTopUpConfig>> =>
      Promise.resolve(notConfigured<AutoTopUpConfig>()),
    disableAutoTopUp: (): Promise<SeamResult<AutoTopUpConfig>> =>
      Promise.resolve(notConfigured<AutoTopUpConfig>()),
  };
}
