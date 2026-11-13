import { seamError, type SeamResult } from "@/services/seam-result";
import { runRead, runWrite, seamCtx } from "@/services/seam-runtime";
import { driverFor } from "@/services/driver-config";
import type { AutoTopUpConfig } from "@/services/model";
import { customerIdSchema, setAutoTopUpSchema } from "@/schemas/preferences";
import type { PreferencesDriver } from "@/services/preferences/preferences-driver";
import { createPreferencesMock } from "@/services/preferences/preferences-mock";
import { createPreferencesHttp } from "@/services/preferences/preferences-http";

/*
 * Preferences seam (auto top-up opt-in state). getAutoTopUp / setAutoTopUp / disableAutoTopUp.
 * Real DXP persists auto-recharge status + a payment agreement; mock by default. Never throws →
 * SeamResult. Amounts are minor units (euro cents).
 */

const driver: PreferencesDriver =
  driverFor("preferences") === "http" ? createPreferencesHttp() : createPreferencesMock();

function invalid<T>(code: string): Promise<SeamResult<T>> {
  return Promise.resolve<SeamResult<T>>({
    ok: false,
    error: seamError(code, "validation", "fixInput"),
  });
}

export function getAutoTopUp(
  customerIdRaw: string,
  correlationId?: string,
): Promise<SeamResult<AutoTopUpConfig | null>> {
  const parsed = customerIdSchema.safeParse(customerIdRaw);
  if (!parsed.success) return invalid<AutoTopUpConfig | null>("preferences.customer.invalid");
  return runRead(seamCtx("preferences", correlationId), "preferences.getAutoTopUp", () =>
    driver.getAutoTopUp(parsed.data),
  );
}

export function setAutoTopUp(input: unknown): Promise<SeamResult<AutoTopUpConfig>> {
  const parsed = setAutoTopUpSchema.safeParse(input);
  if (!parsed.success) return invalid<AutoTopUpConfig>("preferences.setAutoTopUp.invalid");
  return runWrite({ tenantId: "preferences" }, "preferences.setAutoTopUp", () =>
    driver.setAutoTopUp(
      parsed.data.customerId,
      parsed.data.thresholdMinor,
      parsed.data.amountMinor,
    ),
  );
}

export function disableAutoTopUp(customerIdRaw: unknown): Promise<SeamResult<AutoTopUpConfig>> {
  const parsed = customerIdSchema.safeParse(customerIdRaw);
  if (!parsed.success) return invalid<AutoTopUpConfig>("preferences.customer.invalid");
  return runWrite({ tenantId: "preferences" }, "preferences.disableAutoTopUp", () =>
    driver.disableAutoTopUp(parsed.data),
  );
}
