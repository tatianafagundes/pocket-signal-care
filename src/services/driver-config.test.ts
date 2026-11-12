import { afterEach, describe, expect, it, vi } from "vitest";

import { authDriverOrThrow, driverFor } from "@/services/driver-config";

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
