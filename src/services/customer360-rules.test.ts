import { describe, expect, it } from "vitest";

import {
  activeAddOns,
  activityFeed,
  balanceState,
  bucketState,
  composeCustomer360,
  hasBalance,
  daysUntil,
  homeDataPrompt,
  homeNotice,
  renewalCovered,
  renewalWhen,
  lineStatus,
  LOW_REMAINING_RATIO,
  primaryDataBucket,
  primaryPlan,
  planRenewsAt,
  planRenewalVisible,
  renewalShortfall,
} from "@/services/customer360-rules";
import type {
  ActivityItem,
  Balance,
  Customer,
  Offer,
  Party,
  PartyInteraction,
  Product,
  UsageBucket,
} from "@/services/model";

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

  describe("usage composition", () => {
    const mk = (over: Partial<UsageBucket>): UsageBucket => ({
      bucketId: "b",
      type: "data",
      unlimited: false,
      total: { value: 10, unit: "GB" },
      remaining: { value: 5, unit: "GB" },
      ...over,
    });

    it("defaults usage to empty when none is provided", () => {
      const c360 = composeCustomer360({ customer, party, installedBase: [], balance: null });
      expect(c360.usage).toEqual([]);
    });

    it("orders buckets data > voice > sms > roaming regardless of input order", () => {
      const c360 = composeCustomer360({
        customer,
        party,
        installedBase: [],
        balance: null,
        usage: [
          mk({ bucketId: "r", type: "roaming" }),
          mk({ bucketId: "s", type: "sms" }),
          mk({ bucketId: "d", type: "data" }),
          mk({ bucketId: "v", type: "voice" }),
        ],
      });
      expect(c360.usage.map((b) => b.type)).toEqual(["data", "voice", "sms", "roaming"]);
    });

    it("does not mutate the input usage array", () => {
      const input = [mk({ bucketId: "s", type: "sms" }), mk({ bucketId: "d", type: "data" })];
      composeCustomer360({ customer, party, installedBase: [], balance: null, usage: input });
      expect(input.map((b) => b.type)).toEqual(["sms", "data"]);
    });
  });

  describe("primaryDataBucket", () => {
    const dataBucket = (over: Partial<UsageBucket>): UsageBucket => ({
      bucketId: "b",
      type: "data",
      unlimited: false,
      total: { value: 10, unit: "GB" },
      remaining: { value: 6, unit: "GB" },
      ...over,
    });

    it("prefers the data bucket granted by the plan (offerId match)", () => {
      const c360 = composeCustomer360({
        customer,
        party,
        installedBase: [plan], // plan.offerId === "o-plan"
        balance: null,
        offers: [planOffer],
        usage: [
          dataBucket({ bucketId: "addon", offerId: "o-addon" }),
          dataBucket({ bucketId: "planbkt", offerId: "o-plan" }),
        ],
      });
      expect(primaryDataBucket(c360)?.bucketId).toBe("planbkt");
    });

    it("falls back to the first data bucket when none matches the plan", () => {
      const c360 = composeCustomer360({
        customer,
        party,
        installedBase: [plan],
        balance: null,
        usage: [dataBucket({ bucketId: "first", offerId: "o-other" })],
      });
      expect(primaryDataBucket(c360)?.bucketId).toBe("first");
    });

    it("returns null when there is no data bucket", () => {
      const c360 = composeCustomer360({
        customer,
        party,
        installedBase: [plan],
        balance: null,
        usage: [
          {
            bucketId: "v",
            type: "voice",
            unlimited: false,
            total: { value: 100, unit: "min" },
            remaining: { value: 50, unit: "min" },
          },
        ],
      });
      expect(primaryDataBucket(c360)).toBeNull();
    });
  });

  describe("bucketState", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    const mk = (over: Partial<UsageBucket>): UsageBucket => ({
      bucketId: "b",
      type: "data",
      unlimited: false,
      total: { value: 10, unit: "GB" },
      remaining: { value: 5, unit: "GB" },
      ...over,
    });

    it("is ok for a healthy metered bucket (well above the threshold)", () => {
      expect(bucketState(mk({ remaining: { value: 5, unit: "GB" } }), now)).toBe("ok");
    });

    it("is low once remaining is at or below LOW_REMAINING_RATIO of total", () => {
      // 20% of 10 GB = 2 GB: exactly at the threshold counts as low (≤).
      expect(bucketState(mk({ remaining: { value: 2, unit: "GB" } }), now)).toBe("low");
      // Just above the threshold is still ok.
      expect(bucketState(mk({ remaining: { value: 2.01, unit: "GB" } }), now)).toBe("ok");
      // Just below is low.
      expect(bucketState(mk({ remaining: { value: 1, unit: "GB" } }), now)).toBe("low");
    });

    it("uses LOW_REMAINING_RATIO as the boundary (sanity-checks the constant)", () => {
      const total = 100;
      const atThreshold = total * LOW_REMAINING_RATIO;
      expect(
        bucketState(
          mk({
            total: { value: total, unit: "min" },
            remaining: { value: atThreshold, unit: "min" },
          }),
          now,
        ),
      ).toBe("low");
    });

    it("is depleted when a metered bucket has nothing left", () => {
      expect(bucketState(mk({ remaining: { value: 0, unit: "GB" } }), now)).toBe("depleted");
    });

    it("treats negative remaining as depleted", () => {
      expect(bucketState(mk({ remaining: { value: -1, unit: "GB" } }), now)).toBe("depleted");
    });

    it("is expired when validFor.end is in the past, even if remaining looks healthy", () => {
      expect(
        bucketState(
          mk({ remaining: { value: 9, unit: "GB" }, validFor: { end: "2026-01-01T00:00:00Z" } }),
          now,
        ),
      ).toBe("expired");
    });

    it("is pending when validFor.start is in the future", () => {
      expect(bucketState(mk({ validFor: { start: "2026-12-01T00:00:00Z" } }), now)).toBe("pending");
    });

    it("prefers expired over pending when a range is wholly in the past", () => {
      expect(
        bucketState(
          mk({ validFor: { start: "2026-01-01T00:00:00Z", end: "2026-02-01T00:00:00Z" } }),
          now,
        ),
      ).toBe("expired");
    });

    // An unlimited bucket carries no total/remaining — build it without those keys so it is valid
    // under exactOptionalPropertyTypes (omitted ≠ set-to-undefined).
    const unlimited = (over: Partial<UsageBucket> = {}): UsageBucket => ({
      bucketId: "u",
      type: "data",
      unlimited: true,
      ...over,
    });

    it("is ok for an unlimited bucket that is currently active", () => {
      expect(bucketState(unlimited(), now)).toBe("ok");
    });

    it("still reports expired/pending for an unlimited bucket outside its validity", () => {
      expect(bucketState(unlimited({ validFor: { end: "2026-01-01T00:00:00Z" } }), now)).toBe(
        "expired",
      );
      expect(bucketState(unlimited({ validFor: { start: "2026-12-01T00:00:00Z" } }), now)).toBe(
        "pending",
      );
    });

    it("is ok when remaining is unknown (can't invent a warning)", () => {
      // Metered bucket with total but no remaining — omit the remaining key.
      expect(
        bucketState(
          { bucketId: "b", type: "data", unlimited: false, total: { value: 10, unit: "GB" } },
          now,
        ),
      ).toBe("ok");
    });

    it("is ok (not low) when there is no usable total to form a ratio", () => {
      // No total key at all.
      expect(
        bucketState(
          { bucketId: "b", type: "data", unlimited: false, remaining: { value: 1, unit: "GB" } },
          now,
        ),
      ).toBe("ok");
      // Zero total can't form a ratio.
      expect(
        bucketState(
          mk({ total: { value: 0, unit: "GB" }, remaining: { value: 1, unit: "GB" } }),
          now,
        ),
      ).toBe("ok");
    });

    it("ignores an unparseable validity date instead of throwing", () => {
      expect(
        bucketState(
          mk({ validFor: { end: "not-a-date" }, remaining: { value: 5, unit: "GB" } }),
          now,
        ),
      ).toBe("ok");
    });
  });
});

describe("renewalShortfall", () => {
  const offer = { offerId: "o-plan", priceMinor: 1490 } as unknown as Offer;
  const make = (amountMinor: number) =>
    composeCustomer360({
      customer,
      party,
      installedBase: [plan],
      balance: { amountMinor, currency: "EUR" },
      offers: [offer],
    });
  it("should return the missing amount when balance is below the plan price", () => {
    expect(renewalShortfall(make(500))).toBe(990);
  });
  it("should return 0 when balance equals the plan price", () => {
    expect(renewalShortfall(make(1490))).toBe(0);
  });
  it("should return 0 when balance exceeds the plan price", () => {
    expect(renewalShortfall(make(3000))).toBe(0);
  });
});

describe("planRenewsAt", () => {
  const base = { customer, party, installedBase: [plan] };
  it("should use the plan data cycle end when known", () => {
    const c = composeCustomer360({
      ...base,
      balance: { amountMinor: 0, currency: "EUR", validUntil: "2026-12-31T00:00:00Z" },
      usage: [
        {
          bucketId: "b",
          type: "data",
          unlimited: false,
          offerId: "o-plan",
          validFor: { end: "2026-12-01T00:00:00Z" },
        },
      ],
    });
    expect(planRenewsAt(c)).toBe("2026-12-01T00:00:00Z");
  });
  it("should fall back to balance validity when there is no cycle", () => {
    const c = composeCustomer360({
      ...base,
      balance: { amountMinor: 0, currency: "EUR", validUntil: "2026-12-31T00:00:00Z" },
    });
    expect(planRenewsAt(c)).toBe("2026-12-31T00:00:00Z");
  });
  it("should return null when nothing is known", () => {
    expect(planRenewsAt(composeCustomer360({ ...base, balance: null }))).toBeNull();
  });
});

describe("lineStatus", () => {
  const base = { party, installedBase: [plan], balance };
  it("should be suspended when the customer is suspended", () => {
    expect(
      lineStatus(composeCustomer360({ ...base, customer: { ...customer, status: "suspended" } })),
    ).toBe("suspended");
  });
  it("should be pending when the plan is still pending", () => {
    const c = composeCustomer360({
      ...base,
      customer,
      installedBase: [{ ...plan, status: "pending" }],
    });
    expect(lineStatus(c)).toBe("pending");
  });
  it("should be active when customer and plan are active", () => {
    expect(lineStatus(composeCustomer360({ ...base, customer }))).toBe("active");
  });
});

describe("balanceState", () => {
  const now = new Date("2026-11-13T00:00:00Z");
  const make = (b: Balance | null) =>
    composeCustomer360({ customer, party, installedBase: [], balance: b });
  it("should be none when there is no balance record", () => {
    expect(balanceState(make(null), now)).toBe("none");
  });
  it("should be empty when the balance is zero", () => {
    expect(balanceState(make({ amountMinor: 0, currency: "EUR" }), now)).toBe("empty");
  });
  it("should be expired when validUntil is in the past, even with money left", () => {
    expect(
      balanceState(
        make({ amountMinor: 500, currency: "EUR", validUntil: "2026-11-01T00:00:00Z" }),
        now,
      ),
    ).toBe("expired");
  });
  it("should be ok when there is money and it is still valid", () => {
    expect(
      balanceState(
        make({ amountMinor: 500, currency: "EUR", validUntil: "2026-12-31T00:00:00Z" }),
        now,
      ),
    ).toBe("ok");
  });
});

describe("planRenewalVisible", () => {
  // A renewal date comes from the plan's data-cycle bucket end (or balance validity).
  const withRenewal = (over: Partial<Parameters<typeof composeCustomer360>[0]> = {}) =>
    composeCustomer360({
      customer,
      party,
      installedBase: [plan],
      balance,
      usage: [
        {
          bucketId: "b",
          type: "data",
          unlimited: false,
          offerId: "o-plan",
          validFor: { end: "2026-12-08T00:00:00Z" },
        },
      ],
      ...over,
    });
  const now = new Date("2026-11-13T00:00:00Z");

  it("is true for an active line with a renewal date", () => {
    expect(planRenewalVisible(withRenewal({}), now)).toBe(true);
  });
  it("is false when the line is suspended (it is not renewing — the finding)", () => {
    expect(
      planRenewalVisible(withRenewal({ customer: { ...customer, status: "suspended" } }), now),
    ).toBe(false);
  });
  it("is false when the plan is still pending (a Pending badge shows instead)", () => {
    expect(
      planRenewalVisible(withRenewal({ installedBase: [{ ...plan, status: "pending" }] }), now),
    ).toBe(false);
  });
  it("is false when there is no renewal date to show", () => {
    expect(
      planRenewalVisible(
        composeCustomer360({ customer, party, installedBase: [plan], balance: null }),
        now,
      ),
    ).toBe(false);
  });
});

describe("activeAddOns", () => {
  it("should list only add-ons from the installed base", () => {
    const c = composeCustomer360({ customer, party, installedBase: [sim, plan, addon], balance });
    expect(activeAddOns(c).map((p) => p.productId)).toEqual(["pr-ao"]);
  });
});

describe("homeNotice", () => {
  const offer = { offerId: "o-plan", priceMinor: 1490 } as unknown as Offer;
  const make = (status: Customer["status"], amountMinor: number) =>
    composeCustomer360({
      customer: { ...customer, status },
      party,
      installedBase: [plan],
      balance: { amountMinor, currency: "EUR" },
      offers: [offer],
    });
  it("should show only the suspension notice when a suspended line also cannot cover renewal", () => {
    expect(homeNotice(make("suspended", 0))).toBe("suspended");
  });
  it("should show the renewal notice when an active line's balance is below the plan price", () => {
    expect(homeNotice(make("active", 500))).toBe("renewal");
  });
  it("should show nothing when an active line's balance covers the plan price", () => {
    expect(homeNotice(make("active", 1490))).toBeNull();
  });
});

describe("renewalCovered", () => {
  const offer = { offerId: "o-plan", priceMinor: 1490 } as unknown as Offer;
  const make = (amountMinor: number, offers: Offer[] = [offer]) =>
    composeCustomer360({
      customer,
      party,
      installedBase: [plan],
      balance: { amountMinor, currency: "EUR" },
      offers,
    });
  it("should be covered when a €15.00 balance meets a €14.90 plan", () => {
    expect(renewalCovered(make(1500))).toBe(true);
  });
  it("should not be covered when the balance is below the plan price", () => {
    expect(renewalCovered(make(1000))).toBe(false);
  });
  it("should not claim coverage when the plan has no price", () => {
    expect(renewalCovered(make(1500, []))).toBe(false);
  });
});

describe("daysUntil", () => {
  const now = new Date("2026-11-13T07:56:00Z");
  it("should count 25 days from Nov 13 to Dec 8", () => {
    expect(daysUntil("2026-12-08T00:00:00Z", now)).toBe(25);
  });
  it("should be 0 for later today and 1 for tomorrow", () => {
    expect(daysUntil("2026-11-13T23:00:00Z", now)).toBe(0);
    expect(daysUntil("2026-11-14T00:00:00Z", now)).toBe(1);
  });
  it("should be null for an unparseable date", () => {
    expect(daysUntil("not-a-date", now)).toBeNull();
  });
});

describe("renewalWhen", () => {
  const now = new Date("2026-11-13T07:56:00Z");
  const withCycleEnd = (end: string) =>
    composeCustomer360({
      customer,
      party,
      installedBase: [plan],
      balance,
      usage: [
        { bucketId: "b", type: "data", unlimited: false, offerId: "o-plan", validFor: { end } },
      ],
    });
  it("should read relative 25 days for Dec 8 on Nov 13", () => {
    expect(renewalWhen(withCycleEnd("2026-12-08T00:00:00Z"), now)).toMatchObject({
      days: 25,
      relative: true,
    });
  });
  it("should still read relative at exactly 30 days", () => {
    expect(renewalWhen(withCycleEnd("2026-12-13T00:00:00Z"), now)?.relative).toBe(true);
  });
  it("should show the date when more than 30 days away", () => {
    expect(renewalWhen(withCycleEnd("2026-12-14T00:00:00Z"), now)?.relative).toBe(false);
  });
});

describe("homeDataPrompt", () => {
  const now = new Date("2026-11-13T07:56:00Z");
  const withData = (remaining: number, unlimited = false) =>
    composeCustomer360({
      customer,
      party,
      installedBase: [plan],
      balance,
      usage: [
        {
          bucketId: "b",
          type: "data",
          unlimited,
          offerId: "o-plan",
          total: { value: 10, unit: "GB" },
          remaining: { value: remaining, unit: "GB" },
        },
      ],
    });
  it("should prompt when 1.8 of 10 GB are left", () => {
    expect(homeDataPrompt(withData(1.8), now)).toBe("low");
  });
  it("should prompt when data is used up", () => {
    expect(homeDataPrompt(withData(0), now)).toBe("depleted");
  });
  it("should not prompt when plenty of data is left", () => {
    expect(homeDataPrompt(withData(6), now)).toBeNull();
  });
  it("should not prompt on an unlimited plan", () => {
    expect(homeDataPrompt(withData(0, true), now)).toBeNull();
  });
});

describe("activityFeed", () => {
  const base = { customer, party, installedBase: [] as Product[], balance: null };

  const money = (
    over: Partial<ActivityItem> & Pick<ActivityItem, "activityId" | "occurredAt">,
  ): ActivityItem => ({
    kind: "topUp",
    status: "completed",
    ...over,
  });
  const interaction = (
    over: Partial<PartyInteraction> & Pick<PartyInteraction, "interactionId" | "occurredAt">,
  ): PartyInteraction => ({
    partyId: "p1",
    customerId: "c1",
    tenantId: "drei",
    type: "onboarding",
    status: "completed",
    ...over,
  });

  it("unions money and relationship sources into one list", () => {
    const c360 = composeCustomer360({
      ...base,
      activity: [money({ activityId: "ftx-1", occurredAt: "2026-02-01T10:00:00Z" })],
      interactions: [interaction({ interactionId: "int-1", occurredAt: "2026-01-01T10:00:00Z" })],
    });
    const feed = activityFeed(c360);
    expect(feed).toHaveLength(2);
    expect(feed.map((f) => f.source)).toEqual(["money", "relationship"]);
  });

  it("sorts the merged feed newest-first across both sources", () => {
    const c360 = composeCustomer360({
      ...base,
      activity: [
        money({ activityId: "ftx-old", occurredAt: "2026-01-05T10:00:00Z" }),
        money({ activityId: "ftx-new", occurredAt: "2026-03-20T10:00:00Z" }),
      ],
      interactions: [interaction({ interactionId: "int-mid", occurredAt: "2026-02-10T10:00:00Z" })],
    });
    expect(activityFeed(c360).map((f) => f.feedId)).toEqual([
      "money:ftx-new",
      "rel:int-mid",
      "money:ftx-old",
    ]);
  });

  it("orders equal-timestamp rows deterministically (feedId desc), not by input order", () => {
    // The flaky-test root cause: three rows sharing one timestamp. Without a tie-breaker the order
    // fell back to input order and the assertion flickered. The order must be identical regardless
    // of the order the sources are composed in.
    const sameTime = "2026-02-01T10:00:00Z";
    const build = (activityIds: string[]) =>
      composeCustomer360({
        ...base,
        activity: activityIds.map((id) => money({ activityId: id, occurredAt: sameTime })),
      });
    const forward = activityFeed(build(["ftx-1", "ftx-2", "ftx-3"])).map((f) => f.feedId);
    const reversed = activityFeed(build(["ftx-3", "ftx-2", "ftx-1"])).map((f) => f.feedId);
    // feedId descending: money:ftx-3 > money:ftx-2 > money:ftx-1, whatever the input order.
    expect(forward).toEqual(["money:ftx-3", "money:ftx-2", "money:ftx-1"]);
    expect(reversed).toEqual(forward);
  });

  it("prefixes feedIds by source so keys never collide", () => {
    // Same raw id on both axes must still produce two distinct feed rows.
    const c360 = composeCustomer360({
      ...base,
      activity: [money({ activityId: "x", occurredAt: "2026-02-01T10:00:00Z" })],
      interactions: [interaction({ interactionId: "x", occurredAt: "2026-01-01T10:00:00Z" })],
    });
    const ids = activityFeed(c360).map((f) => f.feedId);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toContain("money:x");
    expect(ids).toContain("rel:x");
  });

  it("carries the signed amount, currency and offer name of a money refill", () => {
    const c360 = composeCustomer360({
      ...base,
      activity: [
        money({
          activityId: "ftx-r",
          occurredAt: "2026-02-01T10:00:00Z",
          kind: "refill",
          amountMinor: -350,
          currency: "EUR",
          offerName: "+1 GB",
        }),
      ],
    });
    const [row] = activityFeed(c360);
    expect(row).toMatchObject({
      kind: "refill",
      amountMinor: -350,
      currency: "EUR",
      offerName: "+1 GB",
    });
  });

  it("omits amount for a relationship row and for an unpriced money refill", () => {
    const c360 = composeCustomer360({
      ...base,
      activity: [
        money({ activityId: "ftx-noamt", occurredAt: "2026-02-02T10:00:00Z", kind: "refill" }),
      ],
      interactions: [interaction({ interactionId: "int-1", occurredAt: "2026-02-01T10:00:00Z" })],
    });
    for (const row of activityFeed(c360)) {
      expect(row.amountMinor).toBeUndefined();
      expect(row.currency).toBeUndefined();
    }
  });

  it("normalizes an inProgress interaction to pending", () => {
    const c360 = composeCustomer360({
      ...base,
      interactions: [
        interaction({
          interactionId: "int-ip",
          occurredAt: "2026-02-01T10:00:00Z",
          status: "inProgress",
        }),
      ],
    });
    expect(activityFeed(c360)[0]?.status).toBe("pending");
  });

  it("is empty when there is no activity and no interactions", () => {
    expect(activityFeed(composeCustomer360(base))).toEqual([]);
  });
});
