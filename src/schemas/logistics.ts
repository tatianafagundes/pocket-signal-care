import { z } from "zod";

import { tenantIdSchema } from "@/schemas/cpr";

/*
 * Zod inputs for the logistics seam (Fase 7 — TMF673 Geographic Address Management, mock).
 *
 * createAddress validates and persists a delivery address for physical-SIM fulfilment, returning
 * an addressId the order carries. The address shape mirrors `DeliveryAddress` in model.ts.
 */

export const addressIdSchema = z.string().trim().min(1);

export const deliveryAddressSchema = z.object({
  line1: z.string().trim().min(1),
  line2: z.string().trim().min(1).optional(),
  city: z.string().trim().min(1),
  region: z.string().trim().min(1),
  postalCode: z.string().trim().min(1),
  /** ISO 3166-1 alpha-2, e.g. "AT". */
  country: z.string().trim().length(2),
});

export const createAddressSchema = z.object({
  customerId: z.string().trim().min(1),
  tenantId: tenantIdSchema,
  address: deliveryAddressSchema,
});

export type CreateAddressInput = z.infer<typeof createAddressSchema>;
