import { describe, expect, it } from "vitest";

import {
  validateEmail,
  scorePassword,
  validateCredentials,
  PASSWORD_MAX_LENGTH,
} from "@/services/auth-rules";

describe("auth-rules.validateEmail", () => {
  it("accepts a plausible address", () => {
    expect(validateEmail("maria@example.com")).toBe(true);
    expect(validateEmail("  maria@example.com  ")).toBe(true); // trimmed
  });

  it("rejects malformed addresses", () => {
    expect(validateEmail("")).toBe(false);
    expect(validateEmail("maria")).toBe(false);
    expect(validateEmail("maria@")).toBe(false);
    expect(validateEmail("maria@example")).toBe(false); // no dot domain
    expect(validateEmail("maria example@x.com")).toBe(false); // space
  });

  it("rejects an over-long input (DoS guard)", () => {
    expect(validateEmail("a".repeat(300) + "@x.com")).toBe(false);
  });
});

describe("auth-rules.scorePassword", () => {
  it("passes a strong password with all criteria", () => {
    expect(scorePassword("Str0ngPass")).toEqual({
      minLength: true,
      hasUpper: true,
      hasLower: true,
      hasNumber: true,
      ok: true,
    });
  });

  it("flags each missing criterion", () => {
    expect(scorePassword("short1A").ok).toBe(false); // < 8
    expect(scorePassword("lowercase1").hasUpper).toBe(false);
    expect(scorePassword("UPPERCASE1").hasLower).toBe(false);
    expect(scorePassword("NoDigitsHere").hasNumber).toBe(false);
  });

  it("fails minLength when over the max", () => {
    const tooLong = "A1a" + "x".repeat(PASSWORD_MAX_LENGTH);
    expect(scorePassword(tooLong).minLength).toBe(false);
  });
});

describe("auth-rules.validateCredentials", () => {
  it("accepts valid email + strong password", () => {
    expect(validateCredentials({ email: "maria@example.com", password: "Str0ngPass" })).toEqual({
      ok: true,
      errors: [],
    });
  });

  it("reports an invalid email", () => {
    const r = validateCredentials({ email: "nope", password: "Str0ngPass" });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("auth.email.invalid");
  });

  it("reports a weak password", () => {
    const r = validateCredentials({ email: "maria@example.com", password: "weak" });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("auth.password.weak");
  });

  it("reports an over-long password distinctly", () => {
    const r = validateCredentials({
      email: "maria@example.com",
      password: "A1a" + "x".repeat(PASSWORD_MAX_LENGTH),
    });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("auth.password.tooLong");
  });
});
