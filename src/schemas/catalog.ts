import { z } from "zod";

import { tenantIdSchema } from "@/schemas/cpr";

/*
 * Zod inputs for the catalog (ECM) seam. (Spec Fase 4.1)
 * listOffers takes a tenant; qualifyOffer takes an offer + a qualification context.
 */

export const offerIdSchema = z.string().trim().min(1);

export const qualifyContextSchema = z.object({
  tenantId: tenantIdSchema,
  /** The customer being qualified, when one exists (onboarding has none yet). */
  customerId: z.string().trim().min(1).optional(),
});

export type QualifyContext = z.infer<typeof qualifyContextSchema>;
