import { z } from "zod";

import { tenantIdSchema } from "@/schemas/cpr";

/*
 * Zod inputs for the resource (DSIMA) seam. (Spec Fase 4.4b / Req 14)
 * SIM/MSISDN selection + reservation — the first step of prepaid onboarding.
 */

export const msisdnSchema = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{6,14}$/, "invalid MSISDN");

// ICCID: 18–22 digits (allow a trailing check digit). Kept lenient for the demo.
export const iccidSchema = z
  .string()
  .trim()
  .regex(/^\d{18,22}$/, "invalid ICCID");

export const reserveMsisdnSchema = z.object({
  tenantId: tenantIdSchema,
  msisdn: msisdnSchema,
});

export type ReserveMsisdnInput = z.infer<typeof reserveMsisdnSchema>;
