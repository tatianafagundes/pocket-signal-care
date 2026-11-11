import { z } from "zod";

/*
 * Zod inputs for the order (EOC) seam. (Spec Fase 4.3)
 */

export const customerIdSchema = z.string().trim().min(1);
export const cartIdSchema = z.string().trim().min(1);
export const offerIdSchema = z.string().trim().min(1);

export const addItemSchema = z.object({
  cartId: cartIdSchema,
  offerId: offerIdSchema,
});

export type AddItemInput = z.infer<typeof addItemSchema>;
