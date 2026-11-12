import { z } from "zod";

import { scorePassword } from "@/services/auth-rules";

/*
 * Account step form: name + email + password in one step. Messages are passed in already
 * localized so the schema stays pure and testable.
 */
export interface AccountFormMessages {
  givenNameRequired: string;
  familyNameRequired: string;
  emailInvalid: string;
  passwordWeak: string;
  confirmMismatch: string;
}

export function buildAccountFormSchema(m: AccountFormMessages) {
  return z
    .object({
      givenName: z.string().trim().min(1, m.givenNameRequired),
      familyName: z.string().trim().min(1, m.familyNameRequired),
      email: z.string().trim().email(m.emailInvalid),
      password: z.string().refine((pw) => scorePassword(pw).ok, m.passwordWeak),
      confirm: z.string(),
    })
    .refine((v) => v.password === v.confirm, { path: ["confirm"], message: m.confirmMismatch });
}

export type AccountFormValues = z.infer<ReturnType<typeof buildAccountFormSchema>>;

/** Editing an account that already exists: name + email only, no password. */
export function buildAccountEditSchema(
  m: Omit<AccountFormMessages, "passwordWeak" | "confirmMismatch">,
) {
  return z.object({
    givenName: z.string().trim().min(1, m.givenNameRequired),
    familyName: z.string().trim().min(1, m.familyNameRequired),
    email: z.string().trim().email(m.emailInvalid),
    password: z.string(),
    confirm: z.string(),
  });
}
