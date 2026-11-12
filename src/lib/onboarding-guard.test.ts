import { describe, expect, it } from "vitest";

import { resolveOnboardingStep } from "@/lib/onboarding-guard";
import { initialOnboardingState } from "@/lib/onboarding-persistence";

const empty = initialOnboardingState("drei");

describe("resolveOnboardingStep", () => {
  it("should send success back to plan when nothing is chosen", () => {
    expect(resolveOnboardingStep("success", empty)).toBe("plan");
  });
  it("should allow the number step once a plan is chosen", () => {
    expect(resolveOnboardingStep("number", { ...empty, selectedOfferId: "o1" })).toBe("number");
  });
  it("should block account until a number is reserved", () => {
    expect(resolveOnboardingStep("account", { ...empty, selectedOfferId: "o1" })).toBe("number");
  });
  it("should block success until activation produced a customer", () => {
    const filled = {
      ...empty,
      selectedOfferId: "o1",
      reservedMsisdn: "+4368140000001",
      email: "a@b.at",
      givenName: "Lena",
      familyName: "Huber",
    };
    expect(resolveOnboardingStep("success", filled)).toBe("review");
    expect(resolveOnboardingStep("success", { ...filled, customerId: "c1" })).toBe("success");
  });
  it("should always allow going back to welcome", () => {
    expect(resolveOnboardingStep("welcome", empty)).toBe("welcome");
  });
});
