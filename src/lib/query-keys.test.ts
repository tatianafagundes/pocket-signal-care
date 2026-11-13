import { queryKeys } from "@/lib/query-keys";

/*
 * These lock the SHAPE of each query key. The bug this guards against is arity/root drift between
 * a query and its invalidation (the review found ["add-ons", tenant, customerId] vs
 * ["add-ons", tenant] diverging). If a key's root or arity changes, this test fails loudly.
 */
describe("queryKeys", () => {
  it("customer360 is [root, tenant, customerId]", () => {
    expect(queryKeys.customer360("drei", "cust-1")).toEqual(["customer360", "drei", "cust-1"]);
  });

  it("customer360All is the shared prefix of customer360", () => {
    const all = queryKeys.customer360All();
    const one = queryKeys.customer360("drei", "cust-1");
    expect(all).toEqual(["customer360"]);
    // The prefix must match element-for-element, or an invalidate-by-prefix would miss.
    expect(one.slice(0, all.length)).toEqual(all);
  });

  it("addOns (per-customer) and addOnsOnboarding (tenant-only) have DIFFERENT roots", () => {
    const perCustomer = queryKeys.addOns("drei", "cust-1");
    const onboarding = queryKeys.addOnsOnboarding("drei");
    expect(perCustomer).toEqual(["add-ons", "drei", "cust-1"]);
    expect(onboarding).toEqual(["add-ons-onboarding", "drei"]);
    // The whole point: they must not collide on root, so one can't accidentally invalidate the other.
    expect(perCustomer[0]).not.toBe(onboarding[0]);
  });

  it("addOnsCatalog is a tenant-only capability probe, distinct from both add-ons keys", () => {
    expect(queryKeys.addOnsCatalog("dreigo")).toEqual(["add-ons-catalog", "dreigo"]);
  });

  it("offers / msisdns are tenant-scoped", () => {
    expect(queryKeys.offers("drei")).toEqual(["offers", "drei"]);
    expect(queryKeys.msisdns("dreigo")).toEqual(["msisdns", "dreigo"]);
  });

  it("esimProfile carries the id and tolerates null while it resolves", () => {
    expect(queryKeys.esimProfile("esim-9")).toEqual(["esim-profile", "esim-9"]);
    expect(queryKeys.esimProfile(null)).toEqual(["esim-profile", null]);
  });
});
