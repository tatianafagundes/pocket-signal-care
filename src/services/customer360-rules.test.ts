import { describe, expect, it } from "vitest";

import { composeCustomer360, hasBalance, primaryPlan } from "@/services/customer360-rules";
import type { Balance, Customer, Party, Product } from "@/services/model";

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
    it("returns the plan product, or null when none", () => {
      expect(
        primaryPlan(
          composeCustomer360({ customer, party, installedBase: [sim, plan], balance: null }),
        ),
      ).toBe(plan);
      expect(
        primaryPlan(composeCustomer360({ customer, party, installedBase: [sim], balance: null })),
      ).toBeNull();
    });
  });
});
