import { afterEach, describe, expect, it } from "vitest";
import { getAutoTopUp, setAutoTopUp, disableAutoTopUp } from "@/services/preferences.functions";
import { clearForcedError, forceError } from "@/services/mock-support";

afterEach(() => clearForcedError());

describe("preferences seam — auto top-up (mock)", () => {
  it("returns null for a customer who never set up auto top-up", async () => {
    const r = await getAutoTopUp("atu-never");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toBeNull();
  });

  it("enables auto top-up with the given threshold + amount, stamping consent", async () => {
    const r = await setAutoTopUp({ customerId: "atu-on", thresholdMinor: 1500, amountMinor: 2000 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.enabled).toBe(true);
      expect(r.data.thresholdMinor).toBe(1500);
      expect(r.data.amountMinor).toBe(2000);
      expect(r.data.method.methodLabel).toContain("Mastercard");
      // The saved method is a token, never a PAN.
      expect(r.data.method.methodToken).not.toMatch(/\d{12,}/);
      expect(typeof r.data.consentAt).toBe("string");
    }
  });

  it("persists the config so a later read returns it", async () => {
    await setAutoTopUp({ customerId: "atu-persist", thresholdMinor: 1000, amountMinor: 3000 });
    const r = await getAutoTopUp("atu-persist");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data?.enabled).toBe(true);
      expect(r.data?.amountMinor).toBe(3000);
    }
  });

  it("disables auto top-up: enabled false, consent cleared, amounts kept", async () => {
    await setAutoTopUp({ customerId: "atu-off", thresholdMinor: 1500, amountMinor: 2000 });
    const r = await disableAutoTopUp("atu-off");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.enabled).toBe(false);
      expect(r.data.consentAt).toBeUndefined();
      // The chosen amounts are retained (so re-enabling shows the last values).
      expect(r.data.thresholdMinor).toBe(1500);
      expect(r.data.amountMinor).toBe(2000);
    }
    const after = await getAutoTopUp("atu-off");
    if (after.ok) expect(after.data?.enabled).toBe(false);
  });

  it("rejects a non-positive threshold/amount (validation)", async () => {
    const r = await setAutoTopUp({ customerId: "atu-bad", thresholdMinor: 0, amountMinor: 2000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.category).toBe("validation");
  });

  it("degrades to a seam error when a mock op is forced to fail", async () => {
    forceError("preferences.getAutoTopUp");
    const r = await getAutoTopUp("atu-on");
    expect(r.ok).toBe(false);
  });
});
