import { afterEach, describe, expect, it } from "vitest";

import { clearSession, loadSession, saveSession } from "@/lib/session-persistence";
import type { SessionCustomer } from "@/lib/session-context";

const STORAGE_KEY = "session:v1";

const dreiSession: SessionCustomer = {
  customerId: "cust-1",
  email: "a@b.at",
  tenantId: "drei",
  givenName: "Mia",
  origin: "mock",
};

afterEach(() => window.sessionStorage.clear());

describe("session-persistence", () => {
  it("returns null when nothing is stored", () => {
    expect(loadSession("drei")).toBeNull();
  });

  it("round-trips a session within the same tenant", () => {
    saveSession(dreiSession);
    expect(loadSession("drei")).toEqual(dreiSession);
  });

  it("refuses to load another tenant's session", () => {
    saveSession(dreiSession);
    expect(loadSession("dreigo")).toBeNull();
  });

  it("never persists a token field (non-secret identity only)", () => {
    saveSession(dreiSession);
    const raw = window.sessionStorage.getItem(STORAGE_KEY) ?? "";
    expect(raw).not.toMatch(/token/i);
  });

  it("starts signed out on malformed JSON", () => {
    window.sessionStorage.setItem(STORAGE_KEY, "{ not json");
    expect(loadSession("drei")).toBeNull();
  });

  it("rejects a session missing a customerId", () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ email: "a@b.at", tenantId: "drei", origin: "mock" }),
    );
    expect(loadSession("drei")).toBeNull();
  });

  it("rejects an unknown origin", () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...dreiSession, origin: "evil" }));
    expect(loadSession("drei")).toBeNull();
  });

  it("clear removes the session", () => {
    saveSession(dreiSession);
    clearSession();
    expect(loadSession("drei")).toBeNull();
  });
});
