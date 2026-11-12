import { z } from "zod";

/*
 * Zod inputs for the order (EOC) seam. (Spec Fase 4.3; Fase 7.4 adds addressId + simType to submit)
 */

export const customerIdSchema = z.string().trim().min(1);
export const cartIdSchema = z.string().trim().min(1);
export const offerIdSchema = z.string().trim().min(1);

export const addItemSchema = z.object({
  cartId: cartIdSchema,
  offerId: offerIdSchema,
});

export type AddItemInput = z.infer<typeof addItemSchema>;

/*
 * submitOrder (Fase 7.4). The cart becomes an order; the order carries the delivery addressId
 * (physical SIM only, from logistics.createAddress) and the simType so the provisioned SIM
 * product records which form was ordered. Both optional — a bare cartId still submits (the pre-7.4
 * callers and the eSIM/no-address path).
 */
export const submitOrderSchema = z.object({
  cartId: cartIdSchema,
  addressId: z.string().trim().min(1).optional(),
  simType: z.enum(["physical", "esim"]).optional(),
});

export type SubmitOrderInput = z.infer<typeof submitOrderSchema>;
