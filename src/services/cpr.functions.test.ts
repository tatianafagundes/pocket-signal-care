import { afterEach, describe, expect, it } from "vitest";

import {
  resolveTenant,
  createParty,
  createCustomer,
  getCustomer360,
  createInteraction,
  listInteractions,
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
        // The demo customer has a seeded onboarding interaction in the timeline.
        expect(r.data.interactions.length).toBeGreaterThanOrEqual(1);
        expect(r.data.interactions[0]!.type).toBe("onboarding");
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

  describe("party interactions (TMF683)", () => {
    it("records an onboarding interaction and lists it newest-first", async () => {
      // Fresh customer so the timeline starts empty.
      const party = await createParty({
        tenantId: "dreigo",
        givenName: "Pia",
        familyName: "Interact",
        email: "pia@dreigo.example",
      });
      if (!party.ok) throw new Error("setup party failed");
      const customer = await createCustomer({ tenantId: "dreigo", partyId: party.data.partyId });
      if (!customer.ok) throw new Error("setup customer failed");
      const customerId = customer.data.customerId;

      const before = await listInteractions(customerId);
      expect(before.ok).toBe(true);
      if (before.ok) expect(before.data).toHaveLength(0);

      const created = await createInteraction({
        tenantId: "dreigo",
        partyId: party.data.partyId,
        customerId,
        type: "onboarding",
        status: "completed",
        relatedEntities: { orderId: "order-xyz", msisdn: "+4368150000009" },
      });
      expect(created.ok).toBe(true);
      if (created.ok) {
        expect(created.data.interactionId).toMatch(/^pi-/);
        expect(created.data.type).toBe("onboarding");
        expect(created.data.tenantId).toBe("dreigo");
        expect(created.data.relatedEntities?.orderId).toBe("order-xyz");
      }

      const after = await listInteractions(customerId);
      expect(after.ok).toBe(true);
      if (after.ok) {
        expect(after.data).toHaveLength(1);
        expect(after.data[0]!.type).toBe("onboarding");
        expect(after.data[0]!.status).toBe("completed");
      }

      // It surfaces in the 360 timeline too.
      const c360 = await getCustomer360(customerId);
      if (c360.ok) expect(c360.data.interactions.map((i) => i.type)).toContain("onboarding");
    });

    it("defaults status to completed and rejects a bad type (validation)", async () => {
      const ok = await createInteraction({
        tenantId: "drei",
        partyId: "demo-party-drei",
        customerId: "demo-drei",
        type: "topUp",
      });
      expect(ok.ok).toBe(true);
      if (ok.ok) expect(ok.data.status).toBe("completed");

      const bad = await createInteraction({
        tenantId: "drei",
        partyId: "p",
        customerId: "c",
        type: "not-a-type",
      });
      expect(bad.ok).toBe(false);
      if (!bad.ok) expect(bad.error.category).toBe("validation");
    });
  });
});
