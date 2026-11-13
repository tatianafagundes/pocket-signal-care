import { afterEach, describe, expect, it } from "vitest";

import {
  resolveTenant,
  createParty,
  createCustomer,
  createContract,
  getCustomer360,
  createInteraction,
  listInteractions,
} from "@/services/cpr.functions";
import { clearForcedError, forceError } from "@/services/mock-support";
import * as seamLogger from "@/services/seam-logger";

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
        // ECM join: the plan resolves to its catalogue offer; the SIM PO has no catalogue entry.
        const plan = r.data.installedBase.find((p) => p.kind === "plan")!;
        const simProduct = r.data.installedBase.find((p) => p.kind === "sim")!;
        expect(plan.offer).not.toBeNull();
        expect(plan.offer?.offerId).toBe(plan.offerId);
        expect(simProduct.offer).toBeNull();
        // Usage (TMF654): the seeded buckets reach the 360, ordered data→voice→sms→roaming.
        expect(r.data.usage.map((b) => b.type)).toEqual(["data", "voice", "sms", "roaming"]);
      }
    });

    it("defence-in-depth: refuses a cross-tenant 360 when expectedTenant mismatches", async () => {
      // A caller acting for drei must not receive dreigo's customer, even with the right id.
      const cross = await getCustomer360("demo-dreigo", "drei");
      expect(cross.ok).toBe(false);
      // Reported as notFound — never reveals the id exists under another brand.
      if (!cross.ok) expect(cross.error.category).toBe("notFound");

      // The matching tenant passes.
      const same = await getCustomer360("demo-dreigo", "dreigo");
      expect(same.ok).toBe(true);
      if (same.ok) expect(same.data.customer.tenantId).toBe("dreigo");

      // Omitting expectedTenant (server-internal / tests) skips the check — back-compatible.
      const unscoped = await getCustomer360("demo-dreigo");
      expect(unscoped.ok).toBe(true);
    });

    it("degrades gracefully when the catalogue (ECM) fails — products present, offer null", async () => {
      forceError("catalog.listOffers");
      forceError("catalog.listAddOns");
      const r = await getCustomer360("demo-drei");
      expect(r.ok).toBe(true);
      if (r.ok) {
        // The installed base is still there (demo-drei: plan + sim); it just isn't enriched.
        expect(r.data.installedBase).toHaveLength(2);
        expect(r.data.installedBase.every((p) => p.offer === null)).toBe(true);
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

    it("degrades gracefully when the interactions timeline fails (empty, not error)", async () => {
      forceError("cpr.listInteractions");
      const r = await getCustomer360("demo-drei");
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.data.customer.customerId).toBe("demo-drei");
        // A failed timeline yields [], never blanks the 360.
        expect(r.data.interactions).toEqual([]);
      }
    });

    it("degrades gracefully when ECEV usage fails (empty usage, 360 still renders)", async () => {
      forceError("charging.getUsage");
      const r = await getCustomer360("demo-drei");
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.data.customer.customerId).toBe("demo-drei");
        // A failed usage read yields [], never blanks the 360; the money axis is unaffected.
        expect(r.data.usage).toEqual([]);
        expect(r.data.balance?.amountMinor).toBe(1500);
      }
    });

    it("includes the financial activity feed, newest first", async () => {
      const r = await getCustomer360("demo-drei");
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.data.activity.length).toBeGreaterThanOrEqual(3);
        // Composed newest-first.
        const times = r.data.activity.map((a) => a.occurredAt);
        expect([...times].sort((x, y) => y.localeCompare(x))).toEqual(times);
      }
    });

    it("degrades gracefully when ECEV activity fails (empty activity, 360 still renders)", async () => {
      forceError("charging.getActivity");
      const r = await getCustomer360("demo-drei");
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.data.customer.customerId).toBe("demo-drei");
        expect(r.data.activity).toEqual([]);
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

  describe("createContract (prepaid)", () => {
    it("creates a contract for an existing customer, keyed by the MSISDN", async () => {
      const party = await createParty({
        tenantId: "drei",
        givenName: "Casey",
        familyName: "Contract",
        email: "casey.contract@drei.example",
      });
      if (!party.ok) throw new Error("setup party failed");
      const customer = await createCustomer({ tenantId: "drei", partyId: party.data.partyId });
      if (!customer.ok) throw new Error("setup customer failed");

      const contract = await createContract({
        tenantId: "drei",
        customerId: customer.data.customerId,
        communicationId: "+4368150000021",
        paymentContext: "PREPAID",
      });
      expect(contract.ok).toBe(true);
      if (contract.ok) expect(contract.data.contractId).toMatch(/^contract-/);
    });

    it("rejects an empty communicationId as a validation error (never sends empty)", async () => {
      const r = await createContract({
        tenantId: "drei",
        customerId: "demo-drei",
        communicationId: "",
        paymentContext: "PREPAID",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.category).toBe("validation");
    });

    it("rejects a contract for an unknown customer as notFound", async () => {
      const r = await createContract({
        tenantId: "drei",
        customerId: "no-such-customer",
        communicationId: "+4368150000022",
        paymentContext: "PREPAID",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("cpr.customer.notFound");
    });
  });

  describe("observability — correlation id propagation", () => {
    it("logs getCustomer360 and all its sub-reads under one correlation id", async () => {
      const spy = vi.spyOn(seamLogger, "logSeamOp").mockImplementation(() => {});
      try {
        const r = await getCustomer360("demo-drei");
        expect(r.ok).toBe(true);

        const records = spy.mock.calls.map((c) => c[0]);
        const ops = records.map((r) => r.op);
        // The fan-out parent and its seam sub-reads all logged.
        expect(ops).toContain("cpr.getCustomer360");
        expect(ops).toContain("order.getInstalledBase");
        expect(ops).toContain("charging.getBalance");
        expect(ops).toContain("catalog.listOffers");

        // The whole 360 request shares ONE correlation id — the point of request-scoped correlation.
        const cids = new Set(records.map((r) => r.correlationId));
        expect(cids.size).toBe(1);
        // And an unrelated op gets its own id (not the 360's).
        spy.mockClear();
        await getCustomer360("demo-dreigo");
        const secondCid = spy.mock.calls[0]?.[0].correlationId;
        expect(secondCid).toBeTruthy();
        expect(cids.has(secondCid!)).toBe(false);
      } finally {
        spy.mockRestore();
      }
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
