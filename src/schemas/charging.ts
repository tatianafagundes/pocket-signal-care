import { z } from "zod";

/*
 * Zod inputs for the charging (ECEV) seam. (Spec Fase 4.4)
 * Amounts are minor units (euro cents) — the UI formats by locale.
 */

export const customerIdSchema = z.string().trim().min(1);
export const orderIdSchema = z.string().trim().min(1);

export const topUpSchema = z.object({
  customerId: customerIdSchema,
  /** Amount to add, in euro cents. Positive integer. */
  amountMinor: z.number().int().positive(),
});

export const deductSchema = z.object({
  customerId: customerIdSchema,
  /** Amount to deduct, in euro cents. Positive integer. */
  amountMinor: z.number().int().positive(),
});

export type TopUpInput = z.infer<typeof topUpSchema>;
export type DeductInput = z.infer<typeof deductSchema>;
