import { newCorrelationId } from "@/services/seam-logger";

/*
 * seam-logger: the correlation-id generator is the piece with real logic worth locking. logSeamOp
 * itself is a thin, environment-branched console sink (silent under test), so there's nothing
 * deterministic to assert about it here — the VALUE of correlation is proven in
 * cpr.functions.test.ts, where a getCustomer360 fan-out is shown to log every sub-op under one id.
 */
describe("newCorrelationId", () => {
  it("returns a short, non-empty id", () => {
    const id = newCorrelationId();
    expect(id).toBeTruthy();
    expect(id.length).toBeGreaterThan(0);
    expect(id.length).toBeLessThanOrEqual(8);
  });

  it("returns a different id on each call (unique enough for correlation)", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newCorrelationId()));
    // Not a cryptographic guarantee, but collisions across 50 calls would indicate a broken source.
    expect(ids.size).toBeGreaterThan(45);
  });
});
