import { describe, expect, it } from "vitest";

import { formatQuantity } from "@/lib/usage-format";

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
