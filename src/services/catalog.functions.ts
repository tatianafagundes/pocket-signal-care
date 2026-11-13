import { seamError, type SeamResult } from "@/services/seam-result";
import { runRead, seamCtx } from "@/services/seam-runtime";
import { driverFor } from "@/services/driver-config";
import type { Offer } from "@/services/model";
import type { QualifyResult } from "@/services/catalog-rules";
import { tenantIdSchema } from "@/schemas/cpr";
import { offerIdSchema, qualifyContextSchema } from "@/schemas/catalog";
import type { CatalogDriver } from "@/services/catalog/catalog-driver";
import { createCatalogMock } from "@/services/catalog/catalog-mock";
import { createCatalogHttp } from "@/services/catalog/catalog-http";
import { getBalance } from "@/services/charging.functions";

/*
 * Catalog (ECM) seam. (Spec Fase 4.2) listOffers + qualifyOffer. Mock by default (ECM stays
 * mock for the demo). Same shape as the CPR seam: Zod-validate → runRead → driver.
 */

const driver: CatalogDriver =
  driverFor("ecm") === "http" ? createCatalogHttp() : createCatalogMock();

export function listOffers(
  tenantIdRaw: string,
  correlationId?: string,
): Promise<SeamResult<Offer[]>> {
  const parsed = tenantIdSchema.safeParse(tenantIdRaw);
  if (!parsed.success) {
    return Promise.resolve<SeamResult<Offer[]>>({
      ok: false,
      error: seamError("catalog.tenant.invalid", "validation", "fixInput"),
    });
  }
  return runRead(seamCtx(parsed.data, correlationId), "catalog.listOffers", () =>
    driver.listOffers(parsed.data),
  );
}

export function listAddOns(
  tenantIdRaw: string,
  correlationId?: string,
): Promise<SeamResult<Offer[]>> {
  const parsed = tenantIdSchema.safeParse(tenantIdRaw);
  if (!parsed.success) {
    return Promise.resolve<SeamResult<Offer[]>>({
      ok: false,
      error: seamError("catalog.tenant.invalid", "validation", "fixInput"),
    });
  }
  return runRead(seamCtx(parsed.data, correlationId), "catalog.listAddOns", () =>
    driver.listAddOns(parsed.data),
  );
}

export function qualifyOffer(
  offerIdRaw: string,
  ctxRaw: unknown,
): Promise<SeamResult<QualifyResult>> {
  const offer = offerIdSchema.safeParse(offerIdRaw);
  const ctx = qualifyContextSchema.safeParse(ctxRaw);
  if (!offer.success || !ctx.success) {
    return Promise.resolve<SeamResult<QualifyResult>>({
      ok: false,
      error: seamError("catalog.qualify.invalid", "validation", "fixInput"),
    });
  }
  return runRead({ tenantId: ctx.data.tenantId }, "catalog.qualifyOffer", async () => {
    // For an existing customer, fetch the balance so the rule can flag "top up first" when an
    // offer costs more than the balance (Req 3.4). Onboarding (no customer) skips this.
    let balanceMinor: number | undefined;
    if (ctx.data.customerId) {
      const bal = await getBalance(ctx.data.customerId);
      if (bal.ok && bal.data) balanceMinor = bal.data.amountMinor;
    }
    return driver.qualifyOffer(offer.data, ctx.data, balanceMinor);
  });
}
