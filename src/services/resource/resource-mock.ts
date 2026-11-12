import { ok, err, seamError } from "@/services/seam-result";
import type { EsimProfile, Msisdn, SimValidation } from "@/services/model";
import type { TenantId } from "@/lib/tenant-rules";
import { withMock } from "@/services/mock-support";
import type { ResourceDriver } from "@/services/resource/resource-driver";

/*
 * Resource (DSIMA) mock driver. (Spec Fase 4.4b / Req 14)
 *
 * A pool of available MSISDNs per tenant, module-level so a reservation is gone from the pool
 * on the next list (exercises the concurrency the real reserve has: two users can't take the
 * same number). reserveMsisdn marks + removes; a second reserve of the same number fails.
 * validateSim accepts a plausible ICCID and rejects one ending in 0000 (a deterministic
 * "bad SIM" for the demo's error path).
 */

function seedPool(tenantId: TenantId): Msisdn[] {
  // Austrian mobile range (+43 68x) for Drei; a distinct block for DreiGo.
  const base = tenantId === "drei" ? 4368140000000 : 4368150000000;
  return Array.from({ length: 5 }, (_, i) => ({
    msisdn: `+${base + i + 1}`,
    tenantId,
    status: "available" as const,
  }));
}

// tenant -> available numbers. Seeded lazily per tenant on first access.
const pools = new Map<TenantId, Msisdn[]>();
// reservationId -> msisdn, so a reservation is traceable.
const reservations = new Map<string, string>();
// eSIM profiles: keyed by id for getEsimProfile, and a customer+tenant index for idempotency.
const esimProfiles = new Map<string, EsimProfile>();
const esimByCustomer = new Map<string, string>(); // "customerId:tenantId" -> esimProfileId

function poolFor(tenantId: TenantId): Msisdn[] {
  let pool = pools.get(tenantId);
  if (!pool) {
    pool = seedPool(tenantId);
    pools.set(tenantId, pool);
  }
  return pool;
}

function cryptoId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function createResourceMock(): ResourceDriver {
  return {
    listAvailableMsisdn(tenantId) {
      return withMock("resource.listAvailableMsisdn", () =>
        ok(
          poolFor(tenantId)
            .filter((m) => m.status === "available")
            .map((m) => ({ ...m })),
        ),
      );
    },

    reserveMsisdn(tenantId, msisdn) {
      return withMock("resource.reserveMsisdn", () => {
        const pool = poolFor(tenantId);
        const entry = pool.find((m) => m.msisdn === msisdn);
        if (!entry) {
          return err(seamError("resource.msisdn.notFound", "notFound", "fixInput"));
        }
        if (entry.status === "reserved") {
          // Concurrency: someone already took this number.
          return err(
            seamError(
              "resource.msisdn.taken",
              "conflict",
              "fixInput",
              "That number was just reserved.",
            ),
          );
        }
        entry.status = "reserved";
        const reservationId = `resv-${cryptoId()}`;
        reservations.set(reservationId, msisdn);
        return ok({ reservationId });
      });
    },

    validateSim(iccid) {
      return withMock("resource.validateSim", () => {
        // Deterministic demo rule: an ICCID ending in 0000 is a known-bad SIM.
        const valid = !iccid.endsWith("0000");
        const result: SimValidation = valid
          ? { iccid, valid: true, simType: "physical" }
          : { iccid, valid: false };
        return ok(result);
      });
    },

    requestEsimProfile(customerId, tenantId) {
      return withMock("resource.requestEsimProfile", () => {
        // Idempotent per customer+tenant: a retry returns the same profile, never a second eSIM
        // (the dossiê's "Don't pay again" discipline, applied to resource provisioning).
        const key = `${customerId}:${tenantId}`;
        const existingId = esimByCustomer.get(key);
        if (existingId) {
          const existing = esimProfiles.get(existingId);
          if (existing) return ok({ ...existing });
        }
        const esimProfileId = `esim-${cryptoId()}`;
        // 19-digit test ICCID (89 + AT MCC/MNC-ish filler + id-derived tail). Not a real ICCID.
        const iccid =
          `893143${esimProfileId.replace(/\D/g, "").padEnd(8, "0").slice(0, 8)}00000`.slice(0, 19);
        const smdp = tenantId === "drei" ? "smdp.drei.at" : "smdp.dreigo.at";
        const matchingId = cryptoId().toUpperCase();
        const profile: EsimProfile = {
          esimProfileId,
          iccid,
          activationCode: `LPA:1$${smdp}$${matchingId}`,
          installUrl: `https://${smdp}/esim/${matchingId}`,
          status: "ready",
          state: "ready",
        };
        esimProfiles.set(esimProfileId, profile);
        esimByCustomer.set(key, esimProfileId);
        return ok({ ...profile });
      });
    },

    getEsimProfile(esimProfileId) {
      return withMock("resource.getEsimProfile", () => {
        const profile = esimProfiles.get(esimProfileId);
        if (!profile) {
          return err(seamError("resource.esimProfile.notFound", "notFound", "contactSupport"));
        }
        return ok({ ...profile });
      });
    },
  };
}
