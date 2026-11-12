import { ok, err, seamError } from "@/services/seam-result";
import type { Account, Credentials, Session } from "@/services/model";
import { withMock } from "@/services/mock-support";
import { validateCredentials, validateEmail } from "@/services/auth-rules";
import type { AuthDriver } from "@/services/auth/auth-driver";

/*
 * Auth mock driver. (Spec Fase 5 / onboarding-journey Req 4)
 *
 * In-memory account store (email -> Account), module-level so a registered email is "taken" for
 * the rest of the session. Validates via the PURE auth-rules, then DISCARDS the password — the
 * store only records that an account exists (email + createdAt), never the secret.
 *
 * This store is intentionally SEPARATE from the cpr-mock store: an auth account does not map to
 * a CPR party/customer in this phase. Do not try to sync them.
 *
 * Demo decision: login accepts ANY format-valid credential (no password check) — enough for the
 * demo, honest as a mock. register enforces validity + unique email. The real IdP (Keycloak)
 * does the actual authentication; see auth-http.ts.
 */

// email -> Account. Lower-cased key so "A@x.com" and "a@x.com" are the same account.
const accounts = new Map<string, Account>();

function key(email: string): string {
  return email.trim().toLowerCase();
}

function mockSession(c: Credentials): Session {
  // `token` is opaque and has NO security value — it's a fake, flagged by origin: "mock".
  return {
    token: `mock-${crypto.randomUUID()}`,
    email: c.email.trim(),
    tenantId: c.tenantId,
    origin: "mock",
  };
}

export function createAuthMock(): AuthDriver {
  return {
    register(credentials) {
      return withMock("auth.register", () => {
        const check = validateCredentials(credentials);
        if (!check.ok) {
          // First failing criterion drives the error key; the UI also shows the live checklist.
          const code = check.errors[0] ?? "auth.register.invalid";
          return err(seamError(code, "validation", "fixInput"));
        }
        const k = key(credentials.email);
        if (accounts.has(k)) {
          return err(
            seamError("auth.register.emailInUse", "conflict", "fixInput", "Email already in use."),
          );
        }
        // Record the account WITHOUT the password. The password goes out of scope here.
        accounts.set(k, { email: credentials.email.trim(), createdAt: new Date().toISOString() });
        return ok(mockSession(credentials));
      });
    },

    changeEmail(change) {
      return withMock("auth.changeEmail", () => {
        if (!validateEmail(change.newEmail)) {
          return err(seamError("auth.changeEmail.invalid", "validation", "fixInput"));
        }
        const from = key(change.currentEmail);
        const to = key(change.newEmail);
        const existing = accounts.get(from);
        if (from === to) {
          // Same address (maybe different casing): nothing to move.
          const same = existing ?? {
            email: change.newEmail.trim(),
            createdAt: new Date().toISOString(),
          };
          return ok(same);
        }
        if (accounts.has(to)) {
          return err(
            seamError("auth.register.emailInUse", "conflict", "fixInput", "Email already in use."),
          );
        }
        // The in-memory store resets on reload; an unknown current email is recreated, not refused.
        const moved: Account = {
          email: change.newEmail.trim(),
          createdAt: existing?.createdAt ?? new Date().toISOString(),
        };
        accounts.delete(from);
        accounts.set(to, moved);
        return ok(moved);
      });
    },

    login(credentials) {
      return withMock("auth.login", () => {
        // Demo: accept any FORMAT-valid credential. Only shape is checked, not a stored password.
        if (!validateEmail(credentials.email) || credentials.password.length === 0) {
          return err(seamError("auth.login.invalid", "validation", "fixInput"));
        }
        return ok(mockSession(credentials));
      });
    },
  };
}
