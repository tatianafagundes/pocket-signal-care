import { describe, expect, it } from "vitest";

import { buildAccountFormSchema } from "@/schemas/account-form";

const schema = buildAccountFormSchema({
  givenNameRequired: "given",
  familyNameRequired: "family",
  emailInvalid: "email",
  passwordWeak: "weak",
  confirmMismatch: "mismatch",
});
const valid = {
  givenName: "Lena",
  familyName: "Huber",
  email: "lena@example.at",
  password: "Sommer2026",
  confirm: "Sommer2026",
};
const errorsFor = (v: Record<string, string>) => {
  const r = schema.safeParse(v);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe("buildAccountFormSchema", () => {
  it("should accept name, email and a strong matching password", () => {
    expect(errorsFor(valid)).toEqual([]);
  });
  it("should require a first name when it is only spaces", () => {
    expect(errorsFor({ ...valid, givenName: "  " })).toContain("given");
  });
  it("should require a last name when it is empty", () => {
    expect(errorsFor({ ...valid, familyName: "" })).toContain("family");
  });
  it("should reject an invalid email", () => {
    expect(errorsFor({ ...valid, email: "lena@" })).toContain("email");
  });
  it("should reject a password without a number", () => {
    expect(errorsFor({ ...valid, password: "Sommerzeit", confirm: "Sommerzeit" })).toContain(
      "weak",
    );
  });
  it("should reject a confirmation that does not match", () => {
    expect(errorsFor({ ...valid, confirm: "Sommer2027" })).toContain("mismatch");
  });
});
