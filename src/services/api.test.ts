import { asSeamFailure, SeamFailure } from "@/services/api";

/*
 * asSeamFailure normalises a query/caught error for the UI. It is the extraction of the
 * `error instanceof SeamFailure ? error : new SeamFailure(…)` block that was copy-pasted into
 * every query's error branch — so these lock the two behaviours that matters:
 *   1. an existing SeamFailure passes through UNCHANGED (its real code/category/retryable survive),
 *   2. anything else is wrapped as a retryable `unavailable` failure tagged with the given code.
 */
describe("asSeamFailure", () => {
  it("passes an existing SeamFailure through unchanged", () => {
    const original = new SeamFailure({
      code: "cpr.customer.notFound",
      category: "notFound",
      retryable: false,
    });
    const result = asSeamFailure(original, "cpr.getCustomer360");
    // Same instance — not re-wrapped, so its real code/category/retryable are preserved.
    expect(result).toBe(original);
    expect(result.code).toBe("cpr.customer.notFound");
    expect(result.retryable).toBe(false);
  });

  it("wraps a non-seam error as a retryable unavailable failure with the given code", () => {
    const result = asSeamFailure(new Error("socket hang up"), "cpr.getCustomer360");
    expect(result).toBeInstanceOf(SeamFailure);
    expect(result.code).toBe("cpr.getCustomer360");
    expect(result.category).toBe("unavailable");
    expect(result.retryable).toBe(true);
    // No customerFacing was supplied, so the customer key falls back to the code.
    expect(result.customerKey).toBe("cpr.getCustomer360");
  });

  it("wraps a non-Error throw (string/unknown) too", () => {
    const result = asSeamFailure("boom", "catalog.listOffers");
    expect(result).toBeInstanceOf(SeamFailure);
    expect(result.code).toBe("catalog.listOffers");
    expect(result.retryable).toBe(true);
  });
});
