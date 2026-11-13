import { ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

import en from "@/locales/en.json";
import { formatPrice } from "@/lib/format";
import { TENANT_IDS, type TenantId } from "@/lib/tenant-rules";
import { listAddOns, listOffers } from "@/services/catalog.functions";
import type { Offer } from "@/services/model";

/*
 * Shared helpers for the PUBLIC MCP tools. They expose only the public catalogue (plans, add-ons,
 * prices) that signed-out visitors already see in onboarding — never customer data. Reads go
 * through the catalog seam, so the MCP server follows the same driver flip as the app.
 */

export const brandSchema = z
  .enum(TENANT_IDS)
  .describe('Which brand to look at: "drei" (Drei) or "dreigo" (DreiGo).');

const BRAND_NAMES: Record<TenantId, string> = { drei: "Drei", dreigo: "DreiGo" };

export function brandName(brand: TenantId): string {
  return BRAND_NAMES[brand];
}

type OfferCopy = Record<string, { tagline?: string; description?: string } | undefined>;
const OFFER_COPY: OfferCopy = en.onboarding.plan.offers;

export function toOfferJson(offer: Offer) {
  const copy = OFFER_COPY[offer.offerId];
  return {
    id: offer.offerId,
    name: offer.name,
    data: offer.dataAmount,
    price: formatPrice(offer.priceMinor, offer.currency, "en"),
    priceCents: offer.priceMinor,
    currency: offer.currency,
    validityDays: offer.validityDays ?? null,
    autoRenews: offer.autoRenew === true,
    euRoaming: offer.euRoaming === true,
    network: offer.network ?? null,
    unlimitedData: offer.unlimitedData === true,
    mostPopular: offer.recommended === true,
    goodFor: offer.tagline ?? copy?.tagline ?? null,
    description: offer.description ?? copy?.description ?? null,
  };
}

export type OfferJson = ReturnType<typeof toOfferJson>;

export function offerLine(o: OfferJson): string {
  const cycle = o.validityDays ? ` every ${o.validityDays} days` : "";
  const extras = [o.network, o.euRoaming ? "EU roaming" : null, o.mostPopular ? "most popular" : null]
    .filter(Boolean)
    .join(", ");
  const goodFor = o.goodFor ? ` — ${o.goodFor}` : "";
  return `${o.name} (${o.id}): ${o.data}, ${o.price}${cycle}${extras ? ` [${extras}]` : ""}${goodFor}`;
}

async function unwrap(result: Awaited<ReturnType<typeof listOffers>>): Promise<Offer[]> {
  if (!result.ok) {
    throw new ToolError("The plan catalogue is unavailable right now. Please try again shortly.");
  }
  return result.data;
}

export async function loadPlans(brand: TenantId): Promise<Offer[]> {
  return unwrap(await listOffers(brand));
}

export async function loadAddOns(brand: TenantId): Promise<Offer[]> {
  return unwrap(await listAddOns(brand));
}
