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

/**
 * Redeem a voucher (CBEV monetary voucher recharge). The client sends only the code + customer —
 * NEVER an amount (the face value is resolved server-side from the code; dossiê + TMF654). The code
 * is 12 digits; spaces/dashes are stripped before validating so "4471 0392 8816" is accepted.
 */
export const redeemVoucherSchema = z.object({
  customerId: customerIdSchema,
  code: z
    .string()
    .transform((s) => s.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^\d{12}$/, "a voucher code is 12 digits")),
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

/**
 * Real DXP recharge input (payment direct-capture → monetaryRecharge journey). Unlike topUp, it
 * carries the `contractId` + MSISDN the journey requires. `methodToken` is the mock's tokenized
 * method; the real payment uses paymentMethod.@type:"cash" + refs, so the http mapper does NOT put
 * methodToken on the wire (recharge spec, M3).
 */
export const rechargeSchema = z.object({
  customerId: customerIdSchema,
  contractId: z.string().trim().min(1),
  communicationId: z.string().trim().min(1),
  amountMinor: z.number().int().positive(),
  methodToken: z.string().trim().min(1),
});

export type TopUpInput = z.infer<typeof topUpSchema>;
export type DeductInput = z.infer<typeof deductSchema>;
export type RechargeInput = z.infer<typeof rechargeSchema>;
export type GrantAllowanceInput = z.infer<typeof grantAllowanceSchema>;
export type RedeemVoucherInput = z.infer<typeof redeemVoucherSchema>;
