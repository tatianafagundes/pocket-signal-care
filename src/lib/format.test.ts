import { describe, expect, it } from "vitest";

import { formatPrice } from "@/lib/format";

/*
 * formatPrice pins the platform ICU output per locale. These assert the ACTUAL runtime strings
 * (symbol placement, decimal separator, grouping), not an idealised form — so a change in glyph
 * placement is caught rather than silently shipped.
 */
describe("formatPrice", () => {
  it("formats EUR in en (US) grouping — symbol first, dot decimal", () => {
    expect(formatPrice(1490, "EUR", "en")).toBe("€14.90");
  });

  it("formats EUR in de-AT — symbol first with a non-breaking space, comma decimal", () => {
    // de-AT uses a non-breaking space (U+00A0) between symbol and amount.
    expect(formatPrice(1490, "EUR", "de-AT")).toBe("€\u00A014,90");
  });

  it("formats zero", () => {
    expect(formatPrice(0, "EUR", "en")).toBe("€0.00");
  });

  it("groups thousands in de-AT (dot as the thousands separator)", () => {
    expect(formatPrice(1234567, "EUR", "de-AT")).toBe("€\u00A012.345,67");
  });
});
