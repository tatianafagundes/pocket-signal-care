import { describe, expect, it } from "vitest";
import { shouldAutoTopUp } from "@/services/auto-top-up-rules";
import type { AutoTopUpConfig, Balance } from "@/services/model";

const method = { methodToken: "tok-visa-7310", methodLabel: "Mastercard •••• 7310" };
const config = (over: Partial<AutoTopUpConfig> = {}): AutoTopUpConfig => ({
  enabled: true,
  thresholdMinor: 1500,
  amountMinor: 2000,
  method,
  consentAt: "2026-11-13T10:00:00Z",
  ...over,
});
const balance = (amountMinor: number): Balance => ({ amountMinor, currency: "EUR" });

describe("shouldAutoTopUp", () => {
  it("fires when enabled and balance is below the threshold", () => {
    expect(shouldAutoTopUp(config(), balance(1240))).toBe(true);
  });

  it("does not fire when the balance is at or above the threshold", () => {
    expect(shouldAutoTopUp(config(), balance(1500))).toBe(false);
    expect(shouldAutoTopUp(config(), balance(3000))).toBe(false);
  });

  it("does not fire when disabled, even below the threshold", () => {
    expect(shouldAutoTopUp(config({ enabled: false }), balance(0))).toBe(false);
  });

  it("does not fire for a null config or a null balance", () => {
    expect(shouldAutoTopUp(null, balance(0))).toBe(false);
    expect(shouldAutoTopUp(config(), null)).toBe(false);
  });
});
