import { ok } from "@/services/seam-result";
import type { AutoTopUpConfig, SavedPaymentMethod } from "@/services/model";
import { withMock } from "@/services/mock-support";
import { tokenizeCardMock } from "@/lib/card-token";
import type { PreferencesDriver } from "@/services/preferences/preferences-driver";

/*
 * Preferences (auto top-up) mock driver.
 *
 * Per-customer auto top-up config in a module-level map. Demo lines start with auto top-up OFF
 * (the honest default — a standing charge mandate is never on without an explicit opt-in). The
 * saved method is the SAME demo card the manual top-up uses, tokenized the same way — there is no
 * real instrument vault; this "saves" the already-tokenized demo card so the recurring charge has
 * a method to reference (see model.SavedPaymentMethod + the debt doc).
 *
 * Defaults mirror the Figma: top up €20 when the balance falls below €15.
 */

const DEMO_CARD_NUMBER = "5555 5555 5555 7310";
const DEMO_METHOD_LABEL = "Mastercard •••• 7310";

/** The single saved method the demo offers (not a real vault). */
function demoSavedMethod(): SavedPaymentMethod {
  return { methodToken: tokenizeCardMock(DEMO_CARD_NUMBER), methodLabel: DEMO_METHOD_LABEL };
}

/** Figma defaults for a fresh opt-in. */
const DEFAULT_THRESHOLD_MINOR = 1500; // €15
const DEFAULT_AMOUNT_MINOR = 2000; // €20

// customerId -> config. Absent = never set up (getAutoTopUp returns null).
const configs = new Map<string, AutoTopUpConfig>();

export function createPreferencesMock(): PreferencesDriver {
  return {
    getAutoTopUp(customerId) {
      return withMock("preferences.getAutoTopUp", () => {
        const config = configs.get(customerId);
        return ok(config ? { ...config, method: { ...config.method } } : null);
      });
    },

    setAutoTopUp(customerId, thresholdMinor, amountMinor) {
      return withMock("preferences.setAutoTopUp", () => {
        const config: AutoTopUpConfig = {
          enabled: true,
          thresholdMinor,
          amountMinor,
          method: demoSavedMethod(),
          // The standing authorization timestamp (stand-in for the DXP payment agreement).
          consentAt: new Date().toISOString(),
        };
        configs.set(customerId, config);
        return ok({ ...config, method: { ...config.method } });
      });
    },

    disableAutoTopUp(customerId) {
      return withMock("preferences.disableAutoTopUp", () => {
        const existing = configs.get(customerId);
        // Disabling keeps the chosen amounts but clears enabled + the consent stamp (opt-out
        // revokes the standing authorization). If none existed, return a disabled default.
        const config: AutoTopUpConfig = {
          enabled: false,
          thresholdMinor: existing?.thresholdMinor ?? DEFAULT_THRESHOLD_MINOR,
          amountMinor: existing?.amountMinor ?? DEFAULT_AMOUNT_MINOR,
          method: existing?.method ?? demoSavedMethod(),
        };
        configs.set(customerId, config);
        return ok({ ...config, method: { ...config.method } });
      });
    },
  };
}
