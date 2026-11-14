import { afterEach, describe, expect, it, vi } from "vitest";

import { assertDriverConfig, authDriverOrThrow, driverFor } from "@/services/driver-config";

/*
 * The auth PROD fail-safe is the security control of Fase A (the mock login accepts any
 * credential, so it must never ship in a production build). These tests protect the guard:
 * a regression that removes the throw would turn one of them red. (Spec Fase 5 security review.)
 *
 * import.meta.env.PROD / the VITE_* flags are controlled with vi.stubEnv; stubs are restored
 * after each test so nothing leaks into the other seam tests.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("driver-config.authDriverOrThrow (PROD fail-safe)", () => {
  it("THROWS in a production build when the auth driver would default to mock", () => {
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_AUTH_DRIVER", ""); // unset → would be "mock"
    expect(() => authDriverOrThrow()).toThrow(/forbidden in production/i);
  });

  it("THROWS in a production build when the auth driver is explicitly mock", () => {
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_AUTH_DRIVER", "mock");
    expect(() => authDriverOrThrow()).toThrow(/forbidden in production/i);
  });

  it("returns http in a production build when configured", () => {
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_AUTH_DRIVER", "http");
    expect(authDriverOrThrow()).toBe("http");
  });

  it("allows mock in a non-production (dev) build — no friction for the demo", () => {
    vi.stubEnv("PROD", false);
    vi.stubEnv("VITE_AUTH_DRIVER", "mock");
    expect(authDriverOrThrow()).toBe("mock");
  });
});

describe("driver-config.driverFor", () => {
  it("defaults to mock and only goes http on an explicit http flag", () => {
    vi.stubEnv("VITE_AUTH_DRIVER", "http");
    expect(driverFor("auth")).toBe("http");
    vi.stubEnv("VITE_AUTH_DRIVER", "keycloak"); // anything not "http" → mock
    expect(driverFor("auth")).toBe("mock");
  });
});

describe("driver-config.assertDriverConfig (boot fail-fast)", () => {
  it("passes with the all-mock default (the zero-config demo)", () => {
    expect(() => assertDriverConfig()).not.toThrow();
  });

  it("passes when CPR is http with no client config (driver defaults to the same-origin BFF)", () => {
    // The token + base URL moved server-side; the client needs nothing, so boot does not throw.
    vi.stubEnv("VITE_CPR_DRIVER", "http");
    vi.stubEnv("VITE_CPR_ACTIVE_BRAND", "drei");
    expect(() => assertDriverConfig()).not.toThrow();
  });

  it("safety rail: THROWS when CPR is http AND a client VITE_CPR_TOKEN is set (token back on client)", () => {
    vi.stubEnv("VITE_CPR_DRIVER", "http");
    vi.stubEnv("VITE_CPR_ACTIVE_BRAND", "drei");
    vi.stubEnv("VITE_CPR_TOKEN", "a-client-token");
    // A client token would undo the BFF — this misconfiguration must never ship.
    expect(() => assertDriverConfig()).toThrow(/VITE_CPR_TOKEN/);
  });

  it("safety rail: does NOT throw on a client token when CPR is mock (rail is http-only)", () => {
    vi.stubEnv("VITE_CPR_DRIVER", "mock");
    vi.stubEnv("VITE_CPR_TOKEN", "a-client-token"); // harmless while the driver is mock
    expect(() => assertDriverConfig()).not.toThrow();
  });

  it("safety rail (recharge, 6.2): THROWS when ECEV is http AND a client VITE_ECEV_TOKEN is set", () => {
    // The recharge token lives server-side (RECHARGE_TOKEN, injected by the recharge BFF). A client
    // VITE_ECEV_TOKEN would undo that — the same rail CPR has, generalized to recharge.
    vi.stubEnv("VITE_ECEV_DRIVER", "http");
    vi.stubEnv("VITE_CPR_ACTIVE_BRAND", "drei");
    vi.stubEnv("VITE_ECEV_TOKEN", "a-client-token");
    expect(() => assertDriverConfig()).toThrow(/VITE_ECEV_TOKEN/);
  });

  it("safety rail (recharge, 6.2): does NOT throw on a client ECEV token when ECEV is mock", () => {
    vi.stubEnv("VITE_ECEV_DRIVER", "mock");
    vi.stubEnv("VITE_ECEV_TOKEN", "a-client-token"); // harmless while the driver is mock
    expect(() => assertDriverConfig()).not.toThrow();
  });

  it("D1 (recharge, 6.2): WARNS when ECEV is http but the active brand is unset, even with CPR mock", () => {
    // Recharge now depends on VITE_CPR_ACTIVE_BRAND too (charging-http sends it as X-App-Brand), so
    // the brand warning must fire for an ecev-http build, not only a cpr-http one.
    vi.stubEnv("VITE_CPR_DRIVER", "mock");
    vi.stubEnv("VITE_ECEV_DRIVER", "http");
    vi.stubEnv("VITE_CPR_ACTIVE_BRAND", ""); // unset
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      assertDriverConfig();
      const warned = warn.mock.calls.some((c) => String(c[0]).includes("VITE_CPR_ACTIVE_BRAND"));
      expect(warned).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it("D1: WARNS when CPR is http but VITE_CPR_ACTIVE_BRAND is unset/invalid", () => {
    vi.stubEnv("VITE_CPR_DRIVER", "http");
    vi.stubEnv("VITE_CPR_ACTIVE_BRAND", ""); // unset
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      assertDriverConfig();
      const warned = warn.mock.calls.some((c) => String(c[0]).includes("VITE_CPR_ACTIVE_BRAND"));
      expect(warned).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it("D1: does NOT warn when the active brand is valid", () => {
    vi.stubEnv("VITE_CPR_DRIVER", "http");
    vi.stubEnv("VITE_CPR_ACTIVE_BRAND", "dreigo");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      assertDriverConfig();
      const warned = warn.mock.calls.some((c) => String(c[0]).includes("VITE_CPR_ACTIVE_BRAND"));
      expect(warned).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });

  it("WARNS (does not throw) when a real-able seam is on mock in a PROD build", () => {
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_CPR_DRIVER", "mock");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() => assertDriverConfig()).not.toThrow();
      const warned = warn.mock.calls.some((c) => String(c[0]).includes("config-warning"));
      expect(warned).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it("does NOT warn about mock in a dev build (mock is the intended demo default)", () => {
    vi.stubEnv("PROD", false);
    vi.stubEnv("VITE_CPR_DRIVER", "mock");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      assertDriverConfig();
      const warned = warn.mock.calls.some((c) => String(c[0]).includes("config-warning"));
      expect(warned).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });
});
