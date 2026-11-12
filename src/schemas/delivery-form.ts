import { z } from "zod";

/*
 * Delivery step form: the shipping address for a PHYSICAL SIM (TMF673 fields). Messages are passed
 * in already localized so the schema stays pure and testable. Mirrors DeliveryAddress in model.ts;
 * `country` is ISO 3166-1 alpha-2 (two letters). `line2` is optional.
 */
export interface DeliveryFormMessages {
  line1Required: string;
  cityRequired: string;
  regionRequired: string;
  postalCodeRequired: string;
  countryInvalid: string;
}

export function buildDeliveryFormSchema(m: DeliveryFormMessages) {
  return z.object({
    line1: z.string().trim().min(1, m.line1Required),
    line2: z.string().trim().optional(),
    city: z.string().trim().min(1, m.cityRequired),
    region: z.string().trim().min(1, m.regionRequired),
    postalCode: z.string().trim().min(1, m.postalCodeRequired),
    country: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/, m.countryInvalid)
      .transform((c) => c.toUpperCase()),
  });
}

export type DeliveryFormValues = z.infer<ReturnType<typeof buildDeliveryFormSchema>>;
