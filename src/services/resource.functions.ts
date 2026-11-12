import { seamError, type SeamResult } from "@/services/seam-result";
import { runRead, runWrite } from "@/services/seam-runtime";
import { driverFor } from "@/services/driver-config";
import type { EsimProfile, Msisdn, SimValidation } from "@/services/model";
import { tenantIdSchema } from "@/schemas/cpr";
import {
  reserveMsisdnSchema,
  iccidSchema,
  requestEsimProfileSchema,
  esimProfileIdSchema,
} from "@/schemas/resource";
import type { ResourceDriver } from "@/services/resource/resource-driver";
import { createResourceMock } from "@/services/resource/resource-mock";
import { createResourceHttp } from "@/services/resource/resource-http";

/*
 * Resource (DSIMA) seam. (Spec Fase 4.4b / Req 14) listAvailableMsisdn / reserveMsisdn /
 * validateSim — the first step of prepaid onboarding. Mock by default. Same shape as the
 * other seams.
 */

const driver: ResourceDriver =
  driverFor("resource") === "http" ? createResourceHttp() : createResourceMock();

function invalid<T>(code: string): Promise<SeamResult<T>> {
  return Promise.resolve<SeamResult<T>>({
    ok: false,
    error: seamError(code, "validation", "fixInput"),
  });
}

export function listAvailableMsisdn(tenantIdRaw: string): Promise<SeamResult<Msisdn[]>> {
  const parsed = tenantIdSchema.safeParse(tenantIdRaw);
  if (!parsed.success) return invalid<Msisdn[]>("resource.tenant.invalid");
  return runRead({ tenantId: parsed.data }, "resource.listAvailableMsisdn", () =>
    driver.listAvailableMsisdn(parsed.data),
  );
}

export function reserveMsisdn(input: unknown) {
  const parsed = reserveMsisdnSchema.safeParse(input);
  if (!parsed.success) return invalid<{ reservationId: string }>("resource.reserve.invalid");
  return runWrite({ tenantId: parsed.data.tenantId }, "resource.reserveMsisdn", () =>
    driver.reserveMsisdn(parsed.data.tenantId, parsed.data.msisdn),
  );
}

export function validateSim(iccidRaw: string): Promise<SeamResult<SimValidation>> {
  const parsed = iccidSchema.safeParse(iccidRaw);
  if (!parsed.success) return invalid<SimValidation>("resource.iccid.invalid");
  return runRead({ tenantId: "resource" }, "resource.validateSim", () =>
    driver.validateSim(parsed.data),
  );
}

/** Ask the SM-DP+ (mock) for an eSIM profile. Idempotent per customer+tenant. */
export function requestEsimProfile(input: unknown): Promise<SeamResult<EsimProfile>> {
  const parsed = requestEsimProfileSchema.safeParse(input);
  if (!parsed.success) return invalid<EsimProfile>("resource.requestEsimProfile.invalid");
  return runWrite({ tenantId: parsed.data.tenantId }, "resource.requestEsimProfile", () =>
    driver.requestEsimProfile(parsed.data.customerId, parsed.data.tenantId),
  );
}

/** Poll an eSIM profile's lifecycle by id. */
export function getEsimProfile(esimProfileIdRaw: unknown): Promise<SeamResult<EsimProfile>> {
  const parsed = esimProfileIdSchema.safeParse(esimProfileIdRaw);
  if (!parsed.success) return invalid<EsimProfile>("resource.getEsimProfile.invalid");
  return runRead({ tenantId: "resource" }, "resource.getEsimProfile", () =>
    driver.getEsimProfile(parsed.data),
  );
}
