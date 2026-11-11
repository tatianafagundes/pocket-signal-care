import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TenantContext } from "@/lib/tenant-context";
import "@/i18n";

// Module reloads must reuse the unchanged context dependency, as hot updates do.
vi.doMock("@/lib/tenant-context", () => ({ TenantContext }));

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

describe("TenantProvider", () => {
  it("should preserve context between a mounted provider and a refreshed consumer", async () => {
    const mountedModule = await import("@/components/tenant-provider");
    vi.resetModules();
    const refreshedModule = await import("@/hooks/use-tenant");

    function RefreshedConsumer() {
      const tenant = refreshedModule.useTenant();
      return <output>{JSON.stringify(tenant)}</output>;
    }

    render(
      <mountedModule.TenantProvider>
        <RefreshedConsumer />
      </mountedModule.TenantProvider>,
    );

    await waitFor(() => {
      expect(JSON.parse(screen.getByRole("status").textContent ?? "{}")).toMatchObject({
        tenant: "drei",
        locale: "de-AT",
        source: "default",
      });
    });
  });
});