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

/** Grant/refill a non-monetary allowance bucket (TMF654), triggered by an add-on fulfilment. */
export const grantAllowanceSchema = z
  .object({
    customerId: customerIdSchema,
    type: z.enum(["data", "voice", "sms", "roaming"]),
    /** Offer that granted it — the refill key and the C360 correlation (DMP productOfferingId). */
    offerId: z.string().trim().min(1),
    offerName: z.string().trim().min(1).optional(),
    /** Granted quantity (data in GB, voice in minutes, SMS as a count). Required unless unlimited. */
    amount: z.number().positive().optional(),
    unit: z.enum(["GB", "min", "sms"]).optional(),
    unlimited: z.boolean().optional(),
    validFor: z.object({ start: z.string().optional(), end: z.string().optional() }).optional(),
  })
  // A metered grant must carry both amount and unit; an unlimited grant needs neither.
  .refine((g) => g.unlimited === true || (g.amount !== undefined && g.unit !== undefined), {
    message: "a metered grant requires amount and unit",
  });

export type TopUpInput = z.infer<typeof topUpSchema>;
export type DeductInput = z.infer<typeof deductSchema>;
export type GrantAllowanceInput = z.infer<typeof grantAllowanceSchema>;
