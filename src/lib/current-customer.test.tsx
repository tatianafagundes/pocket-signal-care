import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";

import { fallbackCustomerId, useCurrentCustomerId } from "@/lib/current-customer";
import { SessionContext, type SessionCustomer } from "@/lib/session-context";
import { TenantContext, type TenantContextValue } from "@/lib/tenant-context";
import type { TenantId } from "@/lib/tenant-rules";

afterEach(cleanup);

function tenantValue(tenant: TenantId): TenantContextValue {
  return {
    tenant,
    tenantName: tenant,
    locale: "en",
    source: "default",
    requestedUnknown: null,
    setLocale: () => {},
  };
}

function Wrapper({
  tenant,
  session,
  children,
}: {
  tenant: TenantId;
  session: SessionCustomer | null;
  children: ReactNode;
}) {
  return (
    <TenantContext.Provider value={tenantValue(tenant)}>
      <SessionContext.Provider value={{ session, setSession: () => {}, signOut: () => {} }}>
        {children}
      </SessionContext.Provider>
    </TenantContext.Provider>
  );
}

function Probe() {
  return <output>{useCurrentCustomerId()}</output>;
}

describe("useCurrentCustomerId", () => {
  it("returns the session's customerId when signed in", () => {
    const session: SessionCustomer = {
      customerId: "cust-42",
      email: "a@b.at",
      tenantId: "drei",
      givenName: "Mia",
      origin: "mock",
    };
    render(
      <Wrapper tenant="drei" session={session}>
        <Probe />
      </Wrapper>,
    );
    expect(screen.getByRole("status").textContent).toBe("cust-42");
  });

  it("falls back to the demo customer for the tenant when signed out", () => {
    render(
      <Wrapper tenant="dreigo" session={null}>
        <Probe />
      </Wrapper>,
    );
    expect(screen.getByRole("status").textContent).toBe("demo-dreigo");
  });

  it("fallbackCustomerId formats demo-<tenant>", () => {
    expect(fallbackCustomerId("drei")).toBe("demo-drei");
    expect(fallbackCustomerId("dreigo")).toBe("demo-dreigo");
  });
});
