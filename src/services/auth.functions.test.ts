import { afterEach, describe, expect, it } from "vitest";

import { changeAccountEmail, registerAccount, loginAccount } from "@/services/auth.functions";
import { clearForcedError, forceError } from "@/services/mock-support";

afterEach(() => clearForcedError());

const strong = "Str0ngPass";

// Unique email per test run so the module-level account store doesn't collide across tests.
function uniqueEmail(): string {
  return `user-${crypto.randomUUID().slice(0, 8)}@example.com`;
}

describe("auth seam (mock)", () => {
  it("registers a valid account and returns a mock session", async () => {
    const r = await registerAccount({ tenantId: "drei", email: uniqueEmail(), password: strong });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.origin).toBe("mock");
      expect(r.data.token).toMatch(/^mock-/);
      expect(r.data.tenantId).toBe("drei");
    }
  });

  it("rejects a weak password (validation), never throws", async () => {
    const r = await registerAccount({ tenantId: "drei", email: uniqueEmail(), password: "weak" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.category).toBe("validation");
  });

  it("rejects an invalid email (validation)", async () => {
    const r = await registerAccount({ tenantId: "drei", email: "nope", password: strong });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.category).toBe("validation");
  });

  it("rejects a duplicate email (conflict)", async () => {
    const email = uniqueEmail();
    const first = await registerAccount({ tenantId: "drei", email, password: strong });
    expect(first.ok).toBe(true);
    const second = await registerAccount({ tenantId: "drei", email, password: strong });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.category).toBe("conflict");
      expect(second.error.code).toBe("auth.register.emailInUse");
    }
  });

  it("login accepts any format-valid credential (demo) and returns a session", async () => {
    const r = await loginAccount({ tenantId: "dreigo", email: uniqueEmail(), password: strong });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.origin).toBe("mock");
      expect(r.data.tenantId).toBe("dreigo");
    }
  });

  it("login rejects a malformed email (validation)", async () => {
    const r = await loginAccount({ tenantId: "drei", email: "bad", password: strong });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.category).toBe("validation");
  });

  it("rejects an invalid tenant at the schema boundary", async () => {
    const r = await registerAccount({ tenantId: "acme", email: uniqueEmail(), password: strong });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.category).toBe("validation");
  });

  it("returns tooLong (not generic invalid) for a 129-char password via the seam", async () => {
    // 129 chars is the only length that passes the Zod cap (max 129) yet fires tooLong in
    // auth-rules (> 128) — proving the per-criterion feedback path survives end to end.
    const r = await registerAccount({
      tenantId: "drei",
      email: uniqueEmail(),
      password: "A1a" + "x".repeat(126),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("auth.password.tooLong");
  });

  it("honours a forced error on register (Req 9.3)", async () => {
    forceError("auth.register");
    const r = await registerAccount({ tenantId: "drei", email: uniqueEmail(), password: strong });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.category).toBe("unavailable");
  });

  it("honours a forced error on login (Req 9.3)", async () => {
    forceError("auth.login");
    const r = await loginAccount({ tenantId: "drei", email: uniqueEmail(), password: strong });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.category).toBe("unavailable");
  });

  it("should move an existing account to a new email without a password", async () => {
    const currentEmail = uniqueEmail();
    const newEmail = uniqueEmail();
    await registerAccount({ tenantId: "drei", email: currentEmail, password: strong });
    const r = await changeAccountEmail({ tenantId: "drei", currentEmail, newEmail });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.email).toBe(newEmail);
    // The old email is free again; the new one is taken.
    const again = await registerAccount({
      tenantId: "drei",
      email: currentEmail,
      password: strong,
    });
    expect(again.ok).toBe(true);
    const taken = await registerAccount({ tenantId: "drei", email: newEmail, password: strong });
    expect(taken.ok).toBe(false);
  });

  it("should refuse to change to an email that already has an account", async () => {
    const a = uniqueEmail();
    const b = uniqueEmail();
    await registerAccount({ tenantId: "drei", email: a, password: strong });
    await registerAccount({ tenantId: "drei", email: b, password: strong });
    const r = await changeAccountEmail({ tenantId: "drei", currentEmail: a, newEmail: b });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("auth.register.emailInUse");
  });

  it("should accept the same email again (no change, no conflict)", async () => {
    const email = uniqueEmail();
    await registerAccount({ tenantId: "drei", email, password: strong });
    const r = await changeAccountEmail({ tenantId: "drei", currentEmail: email, newEmail: email });
    expect(r.ok).toBe(true);
  });
});
