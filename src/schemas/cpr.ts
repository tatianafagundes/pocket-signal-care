import { z } from "zod";

import { TENANT_IDS } from "@/lib/tenant-rules";

/*
 * Zod input schemas for the CPR seam. (Spec Fase 3.1)
 *
 * These validate what callers pass IN (the reference pattern validates every seam input with
 * Zod before the handler runs). Output shapes are the canonical types in src/services/model.ts.
 * Keeping the tenant enum sourced from TENANT_IDS means adding a tenant never desyncs here.
 */

export const tenantIdSchema = z.enum(TENANT_IDS);

export const partyInputSchema = z.object({
  tenantId: tenantIdSchema,
  givenName: z.string().trim().min(1),
  familyName: z.string().trim().min(1),
  email: z.string().trim().email(),
  // E.164-ish: optional, +digits, allows leading + and 7–15 digits.
  msisdn: z
    .string()
    .trim()
    .regex(/^\+?[1-9]\d{6,14}$/, "invalid MSISDN")
    .optional(),
});

export const customerInputSchema = z.object({
  tenantId: tenantIdSchema,
  partyId: z.string().trim().min(1),
});

export const customerIdSchema = z.string().trim().min(1);

export type PartyInput = z.infer<typeof partyInputSchema>;
export type CustomerInput = z.infer<typeof customerInputSchema>;
