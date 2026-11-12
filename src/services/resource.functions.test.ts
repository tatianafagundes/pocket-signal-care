import { afterEach, describe, expect, it } from "vitest";

import {
  listAvailableMsisdn,
  reserveMsisdn,
  validateSim,
  requestEsimProfile,
  getEsimProfile,
} from "@/services/resource.functions";
import { clearForcedError } from "@/services/mock-support";

afterEach(() => clearForcedError());

describe("resource seam (DSIMA mock)", () => {
  it("lists available numbers for a tenant", async () => {
    const r = await listAvailableMsisdn("drei");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.length).toBeGreaterThan(0);
      expect(r.data.every((m) => m.status === "available" && m.tenantId === "drei")).toBe(true);
    }
  });

  it("reserves a number and removes it from the available pool (concurrency)", async () => {
    const list = await listAvailableMsisdn("dreigo");
    if (!list.ok || list.data.length === 0) throw new Error("no numbers to reserve");
    const target = list.data[0]!.msisdn;

    const first = await reserveMsisdn({ tenantId: "dreigo", msisdn: target });
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.data.reservationId).toMatch(/^resv-/);

    // Gone from the available pool now.
    const after = await listAvailableMsisdn("dreigo");
    if (after.ok) expect(after.data.some((m) => m.msisdn === target)).toBe(false);

    // A second reserve of the same number conflicts (someone already took it).
    const second = await reserveMsisdn({ tenantId: "dreigo", msisdn: target });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe("resource.msisdn.taken");
      expect(second.error.category).toBe("conflict");
    }
  });

  it("fails to reserve an unknown number", async () => {
    const r = await reserveMsisdn({ tenantId: "drei", msisdn: "+4300000000000" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("resource.msisdn.notFound");
  });

  it("validates a SIM, rejecting the known-bad 0000 ICCID", async () => {
    const good = await validateSim("8943010000000001234");
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(good.data.valid).toBe(true);
      expect(good.data.simType).toBe("physical");
    }

    const bad = await validateSim("8943010000000000000");
    expect(bad.ok).toBe(true);
    if (bad.ok) expect(bad.data.valid).toBe(false);
  });

  it("rejects a malformed ICCID (validation)", async () => {
    const r = await validateSim("not-an-iccid");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.category).toBe("validation");
  });

  it("requests an eSIM profile with an LPA activation code, ready", async () => {
    const r = await requestEsimProfile({ customerId: "esim-cust-1", tenantId: "drei" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.esimProfileId).toMatch(/^esim-/);
      expect(r.data.status).toBe("ready");
      // LPA:1$<smdp-fqdn>$<matchingId>
      expect(r.data.activationCode).toMatch(/^LPA:1\$smdp\.drei\.at\$[A-Z0-9]+$/);
      expect(r.data.iccid).toMatch(/^\d{19}$/);
    }
  });

  it("is idempotent per customer+tenant — a retry returns the same profile", async () => {
    const first = await requestEsimProfile({ customerId: "esim-cust-2", tenantId: "dreigo" });
    const second = await requestEsimProfile({ customerId: "esim-cust-2", tenantId: "dreigo" });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) expect(second.data).toEqual(first.data);
  });

  it("isolates profiles across tenants — same customerId on another tenant is a new profile", async () => {
    const drei = await requestEsimProfile({ customerId: "esim-shared", tenantId: "drei" });
    const dreigo = await requestEsimProfile({ customerId: "esim-shared", tenantId: "dreigo" });
    expect(drei.ok).toBe(true);
    expect(dreigo.ok).toBe(true);
    if (drei.ok && dreigo.ok) {
      expect(dreigo.data.esimProfileId).not.toBe(drei.data.esimProfileId);
      expect(drei.data.activationCode).toContain("smdp.drei.at");
      expect(dreigo.data.activationCode).toContain("smdp.dreigo.at");
    }
  });

  it("reads an eSIM profile back by id, and 404s an unknown id", async () => {
    const created = await requestEsimProfile({ customerId: "esim-cust-3", tenantId: "drei" });
    if (!created.ok) throw new Error("request failed in setup");
    const read = await getEsimProfile(created.data.esimProfileId);
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.data.esimProfileId).toBe(created.data.esimProfileId);

    const missing = await getEsimProfile("esim-does-not-exist");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.category).toBe("notFound");
  });

  it("rejects a malformed eSIM request (validation)", async () => {
    const r = await requestEsimProfile({ customerId: "", tenantId: "drei" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.category).toBe("validation");
  });
});
