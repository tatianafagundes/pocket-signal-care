import { afterEach, describe, expect, it } from "vitest";

import {
  resolveTenant,
  createParty,
  createCustomer,
  getCustomer360,
} from "@/services/cpr.functions";
import { clearForcedError, forceError } from "@/services/mock-support";

afterEach(() => clearForcedError());

/*
 * CPR seam through the mock driver (default VITE_CPR_DRIVER=mock).
 * Verifies the seam returns canonical SeamResults, the demo seed is readable, unknown ids
 * fail as notFound (never throw), and the two-step onboard (party -> customer) works and is
 * then visible in the 360.
 */

describe("cpr seam (mock driver)", () => {
  describe("resolveTenant", () => {
    it("confirms known tenants", async () => {
      const drei = await resolveTenant("drei");
      expect(drei.ok).toBe(true);
      if (drei.ok) {
        expect(drei.data).toMatchObject({ exists: true, id: "drei", name: "Drei" });
      }
      const dreigo = await resolveTenant("dreigo");
      expect(dreigo.ok).toBe(true);
      if (dreigo.ok)
        expect(dreigo.data).toMatchObject({ exists: true, id: "dreigo", name: "DreiGo" });
    });

    it("rejects an invalid tenant as a validation SeamError (never throws)", async () => {
      const r = await resolveTenant("acme");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.category).toBe("validation");
    });
  });

  describe("getCustomer360", () => {
    it("returns the composed view for the seeded demo customer", async () => {
      const r = await getCustomer360("demo-drei");
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.data.customer.customerId).toBe("demo-drei");
        expect(r.data.party.tenantId).toBe("drei");
        // seed has a plan + sim, sorted plan first
        expect(r.data.installedBase.map((p) => p.kind)).toEqual(["plan", "sim"]);
        expect(r.data.balance?.amountMinor).toBe(1500);
      }
    });

    it("degrades gracefully when order/charging fail but CPR is ok", async () => {
      // Arm both sub-seams to fail; the 360 must still return the customer, with an empty
      // installed base and null balance — not error out.
      forceError("order.getInstalledBase");
      forceError("charging.getBalance");
      const r = await getCustomer360("demo-drei");
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.data.customer.customerId).toBe("demo-drei");
        expect(r.data.installedBase).toEqual([]);
        expect(r.data.balance).toBeNull();
      }
    });

    it("fails with notFound for an unknown customer (never throws)", async () => {
      const r = await getCustomer360("does-not-exist");
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.category).toBe("notFound");
        expect(r.error.code).toBe("cpr.customer.notFound");
      }
    });
  });

  describe("onboard flow (createParty -> createCustomer -> 360)", () => {
    it("creates a party, then a customer, visible in the 360 with no balance yet", async () => {
      const party = await createParty({
        tenantId: "drei",
        givenName: "Robin",
        familyName: "New",
        email: "robin.new@drei.example",
      });
      expect(party.ok).toBe(true);
      if (!party.ok) return;

      const customer = await createCustomer({ tenantId: "drei", partyId: party.data.partyId });
      expect(customer.ok).toBe(true);
      if (!customer.ok) return;

      const c360 = await getCustomer360(customer.data.customerId);
      expect(c360.ok).toBe(true);
      if (c360.ok) {
        expect(c360.data.party.givenName).toBe("Robin");
        expect(c360.data.customer.status).toBe("active");
        // brand-new prepaid customer: empty installed base, no balance yet
        expect(c360.data.installedBase).toHaveLength(0);
        expect(c360.data.balance).toBeNull();
      }
    });

    it("rejects createCustomer for an unknown party as notFound", async () => {
      const r = await createCustomer({ tenantId: "drei", partyId: "no-such-party" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("cpr.party.notFound");
    });

    it("rejects invalid party input as a validation error", async () => {
      const r = await createParty({
        tenantId: "drei",
        givenName: "",
        familyName: "X",
        email: "not-an-email",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.category).toBe("validation");
    });
  });
});
