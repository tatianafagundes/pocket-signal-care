import type { Credentials, PasswordStrength } from "@/services/model";

/*
 * Auth validation — a PURE rule. (Spec Fase 5 / onboarding-journey Req 4.2)
 *
 * Email format + password strength, kept pure so the UI's per-criterion feedback (the password
 * checklist, inline email error) is testable without a backend. No I/O, no throw. The mock auth
 * driver and (later) the real IdP both call these to validate before creating a session.
 *
 * Security notes (from the spec's security review):
 *  - Email regex is LINEAR and anti-ReDoS (no nested quantifiers / overlapping classes).
 *  - Inputs are length-capped before testing (DoS guard; a 128-char password max also avoids
 *    expensive hashing of giant inputs in the real IdP).
 *  - The password itself is never stored here or anywhere — these functions only inspect it.
 */

/** Max input lengths — cap before any regex/scan (DoS guard). */
export const EMAIL_MAX_LENGTH = 256;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

// Pragmatic, LINEAR email check — not full RFC 5322. No nested quantifiers: each class is
// `[^\s@]+`, so there is no catastrophic backtracking regardless of input.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True when the email is a plausible address (format only, not deliverability). */
export function validateEmail(email: string): boolean {
  if (typeof email !== "string") return false;
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > EMAIL_MAX_LENGTH) return false;
  return EMAIL_RE.test(trimmed);
}

/**
 * Score a password against each criterion. The UI renders one line per boolean (icon + word),
 * and `ok` gates submission. Criteria (demo-scope, in one place so they are easy to harden):
 * min 8, max 128, at least one uppercase, one lowercase, one digit. Symbols not required —
 * a product decision to reduce friction; tighten here if policy changes.
 */
export function scorePassword(pw: string): PasswordStrength {
  const value = typeof pw === "string" ? pw : "";
  const minLength = value.length >= PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH;
  const hasUpper = /[A-Z]/.test(value);
  const hasLower = /[a-z]/.test(value);
  const hasNumber = /[0-9]/.test(value);
  const ok = minLength && hasUpper && hasLower && hasNumber;
  return { minLength, hasUpper, hasLower, hasNumber, ok };
}

/** i18n keys for credential validation failures — the UI maps these to copy. */
export type AuthValidationError =
  "auth.email.invalid" | "auth.password.weak" | "auth.password.tooLong";

/**
 * Validate a full credentials payload. Returns the set of failing criteria as i18n keys so the
 * caller (seam) can turn them into a SeamError and the UI can show them inline. Pure.
 */
export function validateCredentials(c: Pick<Credentials, "email" | "password">): {
  ok: boolean;
  errors: AuthValidationError[];
} {
  const errors: AuthValidationError[] = [];
  if (!validateEmail(c.email)) errors.push("auth.email.invalid");
  const strength = scorePassword(c.password);
  if (typeof c.password === "string" && c.password.length > PASSWORD_MAX_LENGTH) {
    errors.push("auth.password.tooLong");
  } else if (!strength.ok) {
    errors.push("auth.password.weak");
  }
  return { ok: errors.length === 0, errors };
}
