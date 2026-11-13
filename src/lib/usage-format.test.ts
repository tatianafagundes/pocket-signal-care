import { describe, expect, it } from "vitest";

import { formatQuantity, remainingFraction } from "@/lib/usage-format";
import type { UsageBucket } from "@/services/model";

describe("formatQuantity", () => {
  it("should keep one decimal and drop a trailing zero when no locale is given", () => {
    expect(formatQuantity(3.8)).toBe("3.8");
    expect(formatQuantity(10)).toBe("10");
  });
  it("should use a decimal comma in German", () => {
    expect(formatQuantity(1.8, "de-AT")).toBe("1,8");
  });
  it("should use a decimal point in English", () => {
    expect(formatQuantity(8.24, "en")).toBe("8.2");
  });
});

describe("remainingFraction", () => {
  const mk = (remaining: number, total: number): UsageBucket => ({
    bucketId: "b",
    type: "data",
    unlimited: false,
    remaining: { value: remaining, unit: "GB" },
    total: { value: total, unit: "GB" },
  });
  it("should fill to what is left when 1.8 of 10 GB remain", () => {
    expect(remainingFraction(mk(1.8, 10))).toBeCloseTo(0.18);
  });
  it("should be full when nothing has been used", () => {
    expect(remainingFraction(mk(2, 2))).toBe(1);
  });
  it("should be 0 when the total is unknown", () => {
    expect(remainingFraction({ bucketId: "b", type: "data", unlimited: false })).toBe(0);
  });
});
