import { describe, expect, it } from "vitest";

import { composeCustomer360, hasBalance, primaryPlan } from "@/services/customer360-rules";
import type { Balance, Customer, Offer, Party, Product } from "@/services/model";

const party: Party = {
  partyId: "p1",
  tenantId: "drei",
  givenName: "Alex",
  familyName: "Demo",
  email: "alex@drei.example",
};
const customer: Customer = {
  customerId: "c1",
  tenantId: "drei",
  partyId: "p1",
  status: "active",
  createdAt: "2026-01-15T10:00:00Z",
};
const sim: Product = {
  productId: "pr-sim",
  offerId: "o-sim",
  name: "SIM",
  kind: "sim",
  status: "active",
};
const plan: Product = {
  productId: "pr-plan",
  offerId: "o-plan",
  name: "10 GB",
  kind: "plan",
  status: "active",
};
const addon: Product = {
  productId: "pr-ao",
  offerId: "o-ao",
  name: "Roaming",
  kind: "add-on",
  status: "active",
};
const balance: Balance = { amountMinor: 1500, currency: "EUR" };
const planOffer: Offer = {
  offerId: "o-plan",
  tenantId: "drei",
  name: "Up 10",
  dataAmount: "10 GB",
  priceMinor: 990,
  currency: "EUR",
};

describe("customer360-rules", () => {
  describe("composeCustomer360", () => {
    it("assembles the three sources into one canonical view", () => {
      const c360 = composeCustomer360({ customer, party, installedBase: [plan], balance });
      expect(c360.customer).toBe(customer);
      expect(c360.party).toBe(party);
      expect(c360.balance).toBe(balance);
      expect(c360.installedBase).toHaveLength(1);
    });

    it("sorts the installed base plan > add-on > sim regardless of input order", () => {
      const c360 = composeCustomer360({
        customer,
        party,
        installedBase: [sim, addon, plan],
        balance: null,
      });
      expect(c360.installedBase.map((p) => p.kind)).toEqual(["plan", "add-on", "sim"]);
    });

    it("does not mutate the input array", () => {
      const input = [sim, plan];
      composeCustomer360({ customer, party, installedBase: input, balance: null });
      expect(input.map((p) => p.kind)).toEqual(["sim", "plan"]);
    });

    it("carries a null balance through (new customer)", () => {
      const c360 = composeCustomer360({ customer, party, installedBase: [], balance: null });
      expect(c360.balance).toBeNull();
    });

    it("enriches each product with its catalogue offer, null when not in the catalogue", () => {
      const c360 = composeCustomer360({
        customer,
        party,
        installedBase: [plan, sim],
        balance: null,
        offers: [planOffer],
      });
      const enrichedPlan = c360.installedBase.find((p) => p.kind === "plan")!;
      const enrichedSim = c360.installedBase.find((p) => p.kind === "sim")!;
      // The plan's offerId ("o-plan") resolves to the catalogue offer.
      expect(enrichedPlan.offer).toEqual(planOffer);
      expect(enrichedPlan.offer?.name).toBe("Up 10");
      // The SIM ("o-sim") has no catalogue entry → null, never an error or a raw id.
      expect(enrichedSim.offer).toBeNull();
    });

    it("resolves every offer to null when no catalogue is provided (ECM unavailable)", () => {
      const c360 = composeCustomer360({ customer, party, installedBase: [plan], balance: null });
      expect(c360.installedBase[0]!.offer).toBeNull();
    });

    it("does not mutate the input products when enriching", () => {
      const input = [plan];
      composeCustomer360({
        customer,
        party,
        installedBase: input,
        balance: null,
        offers: [planOffer],
      });
      // The original product object gains no `offer` field.
      expect("offer" in input[0]!).toBe(false);
    });

    it("defaults interactions to empty when none are provided", () => {
      const c360 = composeCustomer360({ customer, party, installedBase: [], balance: null });
      expect(c360.interactions).toEqual([]);
    });

    it("sorts interactions newest-first by occurredAt", () => {
      const older = {
        interactionId: "pi-old",
        partyId: "p1",
        customerId: "c1",
        tenantId: "drei" as const,
        type: "onboarding" as const,
        status: "completed" as const,
        occurredAt: "2026-01-15T10:00:00Z",
      };
      const newer = { ...older, interactionId: "pi-new", occurredAt: "2026-03-01T09:00:00Z" };
      const c360 = composeCustomer360({
        customer,
        party,
        installedBase: [],
        balance: null,
        interactions: [older, newer],
      });
      expect(c360.interactions.map((i) => i.interactionId)).toEqual(["pi-new", "pi-old"]);
    });
  });

  describe("hasBalance", () => {
    it("is true only for a positive balance", () => {
      expect(hasBalance(composeCustomer360({ customer, party, installedBase: [], balance }))).toBe(
        true,
      );
      expect(
        hasBalance(composeCustomer360({ customer, party, installedBase: [], balance: null })),
      ).toBe(false);
      expect(
        hasBalance(
          composeCustomer360({
            customer,
            party,
            installedBase: [],
            balance: { amountMinor: 0, currency: "EUR" },
          }),
        ),
      ).toBe(false);
    });
  });

  describe("primaryPlan", () => {
    it("returns the plan product (enriched), or null when none", () => {
      // primaryPlan now returns the ENRICHED product (a new object), so match by identity fields.
      expect(
        primaryPlan(
          composeCustomer360({ customer, party, installedBase: [sim, plan], balance: null }),
        )?.productId,
      ).toBe(plan.productId);
      expect(
        primaryPlan(composeCustomer360({ customer, party, installedBase: [sim], balance: null })),
      ).toBeNull();
    });
  });
});
