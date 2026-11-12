import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearOnboardingState,
  initialOnboardingState,
  loadOnboardingState,
  saveOnboardingState,
} from "@/lib/onboarding-persistence";
import type { OnboardingState } from "@/lib/onboarding-context";

const STORAGE_KEY = "onboarding:v1";

afterEach(() => {
  window.sessionStorage.clear();
  vi.useRealTimers();
});

describe("onboarding-persistence", () => {
  it("returns a clean initial state when nothing is stored", () => {
    const state = loadOnboardingState("drei");
    expect(state).toEqual(initialOnboardingState("drei"));
    expect(state.step).toBe("welcome");
    expect(state.selectedOfferId).toBeNull();
  });

  it("round-trips saved state within the same tenant", () => {
    const saved: OnboardingState = {
      ...initialOnboardingState("drei"),
      step: "number",
      selectedOfferId: "drei-up",
      reservedMsisdn: "+4369912345678",
      email: "a@b.at",
    };
    saveOnboardingState(saved);
    expect(loadOnboardingState("drei")).toEqual(saved);
  });

  it("never persists a password or token field (shape is non-secret only)", () => {
    saveOnboardingState({ ...initialOnboardingState("drei"), email: "a@b.at" });
    const rawJson = window.sessionStorage.getItem(STORAGE_KEY) ?? "";
    expect(rawJson).not.toMatch(/password|token/i);
  });

  it("refuses to resume another tenant's state (starts clean)", () => {
    saveOnboardingState({
      ...initialOnboardingState("drei"),
      step: "review",
      selectedOfferId: "drei-up",
    });
    // A DreiGo load must not inherit the Drei flow.
    const asDreigo = loadOnboardingState("dreigo");
    expect(asDreigo).toEqual(initialOnboardingState("dreigo"));
  });

  it("expires state older than the TTL", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    saveOnboardingState({ ...initialOnboardingState("drei"), step: "plan" });

    // 61 minutes later — past the 60-minute TTL.
    vi.setSystemTime(new Date("2026-01-01T01:01:00Z"));
    expect(loadOnboardingState("drei")).toEqual(initialOnboardingState("drei"));
  });

  it("still resumes state within the TTL", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    saveOnboardingState({ ...initialOnboardingState("drei"), step: "plan" });

    // 59 minutes later — within the window.
    vi.setSystemTime(new Date("2026-01-01T00:59:00Z"));
    expect(loadOnboardingState("drei").step).toBe("plan");
  });

  it("still resumes at exactly the TTL boundary (60 min is not yet expired)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    saveOnboardingState({ ...initialOnboardingState("drei"), step: "plan" });

    // Exactly 60 minutes: `now - savedAt > TTL` is false, so it still resumes.
    vi.setSystemTime(new Date("2026-01-01T01:00:00Z"));
    expect(loadOnboardingState("drei").step).toBe("plan");
  });

  it("does not let an unknown stored key leak into the revived state", () => {
    const env = {
      savedAt: Date.now(),
      state: { ...initialOnboardingState("drei"), step: "plan", injected: "evil" },
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(env));
    const loaded = loadOnboardingState("drei") as unknown as Record<string, unknown>;
    expect(loaded["injected"]).toBeUndefined();
    expect(Object.keys(loaded).sort()).toEqual(Object.keys(initialOnboardingState("drei")).sort());
  });

  it("starts clean on malformed JSON", () => {
    window.sessionStorage.setItem(STORAGE_KEY, "{ not json");
    expect(loadOnboardingState("drei")).toEqual(initialOnboardingState("drei"));
  });

  it("starts clean when the stored step is not a known step", () => {
    const env = {
      savedAt: Date.now(),
      state: { ...initialOnboardingState("drei"), step: "bogus" },
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(env));
    expect(loadOnboardingState("drei")).toEqual(initialOnboardingState("drei"));
  });

  it("clear removes persisted state", () => {
    saveOnboardingState({ ...initialOnboardingState("drei"), step: "review" });
    clearOnboardingState();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(loadOnboardingState("drei")).toEqual(initialOnboardingState("drei"));
  });

  // --- Fase 7: SIM type + delivery address ---

  it("round-trips simType and a delivery address (physical flow)", () => {
    const saved: OnboardingState = {
      ...initialOnboardingState("drei"),
      step: "delivery",
      selectedOfferId: "drei-up",
      simType: "physical",
      deliveryAddress: {
        line1: "Hauptstrasse 1",
        line2: "Top 4",
        city: "Wien",
        region: "Wien",
        postalCode: "1010",
        country: "AT",
      },
      addressId: "addr-123",
    };
    saveOnboardingState(saved);
    expect(loadOnboardingState("drei")).toEqual(saved);
  });

  it("round-trips an eSIM flow (no delivery address)", () => {
    const saved: OnboardingState = {
      ...initialOnboardingState("drei"),
      step: "review",
      selectedOfferId: "drei-up",
      simType: "esim",
      authorizationRef: "auth-7f3a",
      orderId: "order-9b2",
    };
    saveOnboardingState(saved);
    expect(loadOnboardingState("drei")).toEqual(saved);
  });

  it("drops a malformed simType and address rather than resuming a half-filled object", () => {
    const env = {
      savedAt: Date.now(),
      state: {
        ...initialOnboardingState("drei"),
        step: "delivery",
        selectedOfferId: "drei-up",
        reservedMsisdn: "+4369912345678",
        email: "a@b.at",
        givenName: "Mia",
        familyName: "Berg",
        simType: "satellite", // not a valid SimChoice
        deliveryAddress: { line1: "x", city: "Wien" }, // missing required fields
      },
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(env));
    const loaded = loadOnboardingState("drei");
    expect(loaded.simType).toBeNull();
    expect(loaded.deliveryAddress).toBeNull();
  });

  it("never persists a card number, cvv, or payment token", () => {
    saveOnboardingState({
      ...initialOnboardingState("drei"),
      simType: "physical",
      authorizationRef: "auth-7f3a",
    });
    const env = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "{}");
    // The persisted shape carries no card data at all — not a field name, not a value. (A broad
    // digit-run check would false-positive on the savedAt timestamp, so assert on the keys/values
    // of the state that actually gets stored.)
    const stateJson = JSON.stringify(env.state ?? {});
    expect(stateJson).not.toMatch(/cvv|cvc|paymentMethodToken|cardNumber|\bpan\b/i);
    expect(Object.keys(env.state ?? {})).not.toContain("paymentMethodToken");
  });
});
