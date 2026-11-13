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

  it("THROWS when CPR is http but its required config is missing (incoherent deploy)", () => {
    vi.stubEnv("VITE_CPR_DRIVER", "http");
    vi.stubEnv("VITE_CPR_BASE_URL", "");
    vi.stubEnv("VITE_CPR_TOKEN", "");
    expect(() => assertDriverConfig()).toThrow(/VITE_CPR_BASE_URL/);
  });

  it("passes when CPR is http AND its config is present (local fake base URL)", () => {
    vi.stubEnv("VITE_CPR_DRIVER", "http");
    vi.stubEnv("VITE_CPR_BASE_URL", "http://127.0.0.1:8787");
    vi.stubEnv("VITE_CPR_TOKEN", "tok");
    expect(() => assertDriverConfig()).not.toThrow();
  });

  it("R-F9: THROWS when CPR is http with a NON-localhost base URL (client token safety rail)", () => {
    vi.stubEnv("VITE_CPR_DRIVER", "http");
    vi.stubEnv("VITE_CPR_BASE_URL", "https://cpr.real.example");
    vi.stubEnv("VITE_CPR_TOKEN", "tok");
    // The client token must never reach a real host until the BFF exists.
    expect(() => assertDriverConfig()).toThrow(/not local/i);
  });

  it("R-F9: accepts localhost and ::1, rejects an unparseable base URL", () => {
    vi.stubEnv("VITE_CPR_DRIVER", "http");
    vi.stubEnv("VITE_CPR_TOKEN", "tok");
    vi.stubEnv("VITE_CPR_BASE_URL", "http://localhost:8787");
    expect(() => assertDriverConfig()).not.toThrow();
    vi.stubEnv("VITE_CPR_BASE_URL", "not-a-url");
    expect(() => assertDriverConfig()).toThrow(/not a valid URL/i);
  });

  it("D1: WARNS when CPR is http but VITE_CPR_ACTIVE_BRAND is unset/invalid", () => {
    vi.stubEnv("VITE_CPR_DRIVER", "http");
    vi.stubEnv("VITE_CPR_BASE_URL", "http://127.0.0.1:8787");
    vi.stubEnv("VITE_CPR_TOKEN", "tok");
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
    vi.stubEnv("VITE_CPR_BASE_URL", "http://127.0.0.1:8787");
    vi.stubEnv("VITE_CPR_TOKEN", "tok");
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
