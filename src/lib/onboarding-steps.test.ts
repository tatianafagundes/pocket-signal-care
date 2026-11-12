import { describe, expect, it } from "vitest";

import { ONBOARDING_WORKING_STEPS, workingStepsFor } from "@/lib/onboarding-context";

/*
 * workingStepsFor — the conditional "Step N of M" sequence (Fase 7). `sim` appears only when the
 * tenant offers eSIM; `delivery` drops for an eSIM flow. These drive both the stepper dots and the
 * N-of-M number, so the sequence must be exact.
 */
describe("workingStepsFor", () => {
  it("offers eSIM, choice pending → includes both sim and delivery", () => {
    const steps = workingStepsFor({ offersEsim: true, simType: null });
    expect(steps).toEqual([
      "welcome",
      "plan",
      "sim",
      "addons",
      "number",
      "account",
      "delivery",
      "review",
    ]);
  });

  it("physical SIM → keeps delivery, keeps sim", () => {
    const steps = workingStepsFor({ offersEsim: true, simType: "physical" });
    expect(steps).toContain("sim");
    expect(steps).toContain("delivery");
  });

  it("eSIM → drops delivery (no shipping), keeps sim", () => {
    const steps = workingStepsFor({ offersEsim: true, simType: "esim" });
    expect(steps).toContain("sim");
    expect(steps).not.toContain("delivery");
  });

  it("tenant without eSIM → drops the sim step entirely", () => {
    const steps = workingStepsFor({ offersEsim: false, simType: null });
    expect(steps).not.toContain("sim");
    // physical is the only form, so delivery stays
    expect(steps).toContain("delivery");
  });

  it("never includes the terminal success step", () => {
    for (const simType of [null, "physical", "esim"] as const) {
      for (const offersEsim of [true, false]) {
        expect(workingStepsFor({ offersEsim, simType })).not.toContain("success");
      }
    }
  });

  it("preserves the canonical order from ONBOARDING_WORKING_STEPS", () => {
    const steps = workingStepsFor({ offersEsim: true, simType: "physical" });
    const canonicalIndex = (s: string) => ONBOARDING_WORKING_STEPS.indexOf(s as never);
    const indices = steps.map(canonicalIndex);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });
});
