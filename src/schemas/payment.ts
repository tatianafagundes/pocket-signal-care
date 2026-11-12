import { z } from "zod";

/*
 * Zod inputs for the payment seam (Fase 7 — extensão paymentAuthorization).
 *
 * Money is minor units (euro cents). The card is tokenized BEFORE this seam — the input carries a
 * `methodToken` (an opaque mock token like "tok-visa-4242"), NEVER a PAN/CVV. authorize reserves;
 * capture charges; void releases an uncaptured authorization.
 */

export const authorizationRefSchema = z.string().trim().min(1);

export const authorizeSchema = z.object({
  customerId: z.string().trim().min(1),
  /** Amount to reserve, in euro cents. Positive integer. */
  amountMinor: z.number().int().positive(),
  /** Opaque payment-method token from the (mock) tokenizer. Never a card number. */
  methodToken: z.string().trim().min(1),
});

export const captureSchema = z.object({
  authorizationRef: authorizationRefSchema,
});

export const voidSchema = z.object({
  authorizationRef: authorizationRefSchema,
});

export type AuthorizeInput = z.infer<typeof authorizeSchema>;
export type CaptureInput = z.infer<typeof captureSchema>;
export type VoidInput = z.infer<typeof voidSchema>;
