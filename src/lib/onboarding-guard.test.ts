import { describe, expect, it } from "vitest";

import { resolveOnboardingStep, firstIncompleteStep } from "@/lib/onboarding-guard";
import { initialOnboardingState } from "@/lib/onboarding-persistence";
import type { OnboardingState } from "@/lib/onboarding-context";

const empty = initialOnboardingState("drei");

// A state that has cleared the plan + sim gates (eSIM flow, so no /delivery gate).
const esimFlow: OnboardingState = {
  ...empty,
  selectedOfferId: "o1",
  simType: "esim",
  reservedMsisdn: "+4368140000001",
  email: "a@b.at",
  givenName: "Lena",
  familyName: "Huber",
};

describe("resolveOnboardingStep", () => {
  it("should send success back to plan when nothing is chosen", () => {
    expect(resolveOnboardingStep("success", empty)).toBe("plan");
  });

  it("should require the SIM choice right after a plan is chosen (eSIM offered)", () => {
    // offersEsim defaults true, so /sim is a gate until simType is set.
    expect(resolveOnboardingStep("number", { ...empty, selectedOfferId: "o1" })).toBe("sim");
  });

  it("should allow the number step once a plan AND a SIM form are chosen", () => {
    expect(
      resolveOnboardingStep("number", { ...empty, selectedOfferId: "o1", simType: "esim" }),
    ).toBe("number");
  });

  it("should NOT gate /sim when the tenant offers no eSIM", () => {
    // offersEsim=false: /sim never appears, so number is reachable with just a plan.
    expect(resolveOnboardingStep("number", { ...empty, selectedOfferId: "o1" }, false)).toBe(
      "number",
    );
  });

  it("should block account until a number is reserved", () => {
    expect(
      resolveOnboardingStep("account", { ...empty, selectedOfferId: "o1", simType: "esim" }),
    ).toBe("number");
  });

  it("should block review until a physical SIM has a delivery address", () => {
    const physicalNoAddress: OnboardingState = {
      ...esimFlow,
      simType: "physical",
      deliveryAddress: null,
    };
    expect(resolveOnboardingStep("review", physicalNoAddress)).toBe("delivery");
  });

  it("should allow review once a physical SIM has an address", () => {
    const physicalWithAddress: OnboardingState = {
      ...esimFlow,
      simType: "physical",
      deliveryAddress: {
        line1: "Rennweg 97",
        city: "Wien",
        region: "Wien",
        postalCode: "1030",
        country: "AT",
      },
    };
    expect(resolveOnboardingStep("review", physicalWithAddress)).toBe("review");
  });

  it("should NOT gate /delivery for an eSIM flow", () => {
    // eSIM has no shipping — delivery is skipped; review is reachable without an address.
    expect(resolveOnboardingStep("review", esimFlow)).toBe("review");
  });

  it("should block success until activation produced a customer", () => {
    expect(resolveOnboardingStep("success", esimFlow)).toBe("review");
    expect(resolveOnboardingStep("success", { ...esimFlow, customerId: "c1" })).toBe("success");
  });

  it("should keep the user on account until the name is filled in", () => {
    const partial: OnboardingState = {
      ...empty,
      selectedOfferId: "o1",
      simType: "esim",
      reservedMsisdn: "+4368140000001",
      email: "a@b.at",
    };
    expect(resolveOnboardingStep("review", partial)).toBe("account");
  });

  it("should always allow going back to welcome", () => {
    expect(resolveOnboardingStep("welcome", empty)).toBe("welcome");
  });
});

describe("firstIncompleteStep — the sim/delivery gates (Fase 7.5)", () => {
  it("points at sim first when eSIM is offered and no form is chosen", () => {
    expect(firstIncompleteStep({ ...empty, selectedOfferId: "o1" })).toBe("sim");
  });

  it("skips the sim gate when eSIM is not offered", () => {
    expect(firstIncompleteStep({ ...empty, selectedOfferId: "o1" }, false)).toBe("number");
  });

  it("points at delivery for a physical SIM with no address", () => {
    const s: OnboardingState = {
      ...esimFlow,
      simType: "physical",
      deliveryAddress: null,
    };
    expect(firstIncompleteStep(s)).toBe("delivery");
  });
});
