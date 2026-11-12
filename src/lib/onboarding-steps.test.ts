import { describe, expect, it } from "vitest";

import {
  ONBOARDING_WORKING_STEPS,
  stepAfter,
  stepBefore,
  workingStepsFor,
} from "@/lib/onboarding-context";

/*
 * workingStepsFor — the conditional "Step N of M" sequence (Fase 7). `sim` appears only when the
 * tenant offers eSIM; `delivery` drops for an eSIM flow. These drive both the stepper dots and the
 * N-of-M number, so the sequence must be exact.
 */
describe("workingStepsFor", () => {
  it("offers eSIM, choice pending → includes both sim and delivery", () => {
    const steps = workingStepsFor({ offersEsim: true, simType: null });
    expect(steps).toEqual(["welcome", "plan", "number", "account", "sim", "delivery", "review"]);
  });

  it("physical SIM → keeps delivery and sim, in the exact order", () => {
    const steps = workingStepsFor({ offersEsim: true, simType: "physical" });
    expect(steps).toEqual(["welcome", "plan", "number", "account", "sim", "delivery", "review"]);
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

describe("stepAfter / stepBefore", () => {
  const esim = { offersEsim: true, simType: "esim" } as const;
  const physical = { offersEsim: true, simType: "physical" } as const;

  it("should go plan → number → account → sim", () => {
    expect(stepAfter("plan", esim)).toBe("number");
    expect(stepAfter("number", esim)).toBe("account");
    expect(stepAfter("account", esim)).toBe("sim");
  });

  it("should send a physical SIM to delivery and an eSIM straight to review", () => {
    expect(stepAfter("sim", physical)).toBe("delivery");
    expect(stepAfter("sim", esim)).toBe("review");
  });

  it("should go back from review to delivery for physical and to sim for eSIM", () => {
    expect(stepBefore("review", physical)).toBe("delivery");
    expect(stepBefore("review", esim)).toBe("sim");
    expect(stepBefore("delivery", physical)).toBe("sim");
    expect(stepBefore("sim", esim)).toBe("account");
  });

  it("should go from account to delivery when the brand offers no eSIM", () => {
    expect(stepAfter("account", { offersEsim: false, simType: null })).toBe("delivery");
  });
});
