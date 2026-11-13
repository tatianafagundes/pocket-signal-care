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

/*
 * Contract create input. `communicationId` is the reserved MSISDN (required — a contract keys on
 * it; the onboarding step fails rather than send an empty value). `paymentContext` is PREPAID for
 * this app and defaults so callers need not restate it.
 */
export const createContractSchema = z.object({
  tenantId: tenantIdSchema,
  customerId: customerIdSchema,
  communicationId: z.string().trim().min(1),
  paymentContext: z.literal("PREPAID").default("PREPAID"),
});

/*
 * Party Interaction (TMF683) create input. `type` is open for later moments; `status` defaults to
 * "completed" (onboarding records a done interaction at fulfilment). `relatedEntities` carries the
 * TMF "Related Entity" references (order/MSISDN/cart). tenantId is validated here but the seam
 * also threads it through its context (the X-Tenant-Id equivalent).
 */
export const createInteractionSchema = z.object({
  tenantId: tenantIdSchema,
  partyId: z.string().trim().min(1),
  customerId: customerIdSchema,
  type: z.enum(["onboarding", "topUp", "planChange", "support"]),
  status: z.enum(["inProgress", "completed", "failed"]).default("completed"),
  relatedEntities: z
    .object({
      orderId: z.string().trim().min(1).optional(),
      msisdn: z.string().trim().min(1).optional(),
      cartId: z.string().trim().min(1).optional(),
    })
    .optional(),
  reasonKey: z.string().trim().min(1).optional(),
});

export type PartyInput = z.infer<typeof partyInputSchema>;
export type CustomerInput = z.infer<typeof customerInputSchema>;
export type CreateContractInput = z.infer<typeof createContractSchema>;
export type CreateInteractionInput = z.infer<typeof createInteractionSchema>;
