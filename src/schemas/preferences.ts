import { z } from "zod";

/*
 * Zod inputs for the preferences seam (auto top-up opt-in state). Amounts are minor units
 * (euro cents). The customer never chooses the saved method here — the demo has a single saved
 * card; the threshold/amount are the Figma defaults but validated as positive integers.
 */

export const customerIdSchema = z.string().trim().min(1);

/** Enable auto top-up: threshold + amount (minor units). Consent is implied by this call (the
 *  review screen gates it on a ticked checkbox); the mock stamps consentAt server-side. */
export const setAutoTopUpSchema = z.object({
  customerId: customerIdSchema,
  thresholdMinor: z.number().int().positive(),
  amountMinor: z.number().int().positive(),
});

export type SetAutoTopUpInput = z.infer<typeof setAutoTopUpSchema>;
