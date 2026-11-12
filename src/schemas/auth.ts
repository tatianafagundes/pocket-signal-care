import { z } from "zod";

import { tenantIdSchema } from "@/schemas/cpr";
import { PASSWORD_MAX_LENGTH } from "@/services/auth-rules";

/*
 * Zod inputs for the auth seam. (Spec Fase 5 / onboarding-journey Req 4)
 *
 * Validates the SHAPE of a credentials payload at the seam boundary (tenant present, strings
 * non-empty, password length-capped as a DoS guard). The richer format/strength rules live in
 * the pure auth-rules (so the UI can show per-criterion feedback); this schema is the first gate.
 */

export const credentialsSchema = z.object({
  tenantId: tenantIdSchema,
  email: z.string().trim().min(1).max(256),
  // Cap length here too so an oversized body is rejected before any work. Do NOT trim the
  // password (leading/trailing spaces can be intentional) and never log it.
  password: z
    .string()
    .min(1)
    .max(PASSWORD_MAX_LENGTH + 1),
  givenName: z.string().trim().min(1).optional(),
  familyName: z.string().trim().min(1).optional(),
});

export type CredentialsInput = z.infer<typeof credentialsSchema>;
