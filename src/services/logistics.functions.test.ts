import { afterEach, describe, expect, it } from "vitest";

import { createAddress, getAddress } from "@/services/logistics.functions";
import { clearForcedError } from "@/services/mock-support";

afterEach(() => clearForcedError());

/*
 * Logistics seam (TMF673, mock) — Fase 7.3. createAddress validates + persists a delivery address
 * and returns an addressId; getAddress reads it back. Deterministic rejects: a non-AT country or a
 * postal code starting with "00" is outside the delivery area.
 */

const validAddress = {
  line1: "Rennweg 97-99",
  city: "Wien",
  region: "Wien",
  postalCode: "1030",
  country: "AT",
};

describe("logistics seam (TMF673 mock)", () => {
  it("creates a delivery address and returns an addressId", async () => {
    const r = await createAddress({
      customerId: "demo-drei",
      tenantId: "drei",
      address: validAddress,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.addressId).toMatch(/^addr-/);
      expect(r.data.address.city).toBe("Wien");
    }
  });

  it("reads a persisted address back by id", async () => {
    const created = await createAddress({
      customerId: "demo-drei",
      tenantId: "drei",
      address: validAddress,
    });
    if (!created.ok) throw new Error("createAddress failed in setup");
    const read = await getAddress(created.data.addressId);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.data.addressId).toBe(created.data.addressId);
      expect(read.data.address.postalCode).toBe("1030");
    }
  });

  it("rejects an address outside the delivery area (non-serviced country)", async () => {
    const r = await createAddress({
      customerId: "demo-drei",
      tenantId: "drei",
      address: { ...validAddress, country: "US" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("logistics.addressOutsideDeliveryArea");
      expect(r.error.category).toBe("rejected");
    }
  });

  it("rejects an in-market address with a 00 postal code (demo error path)", async () => {
    const r = await createAddress({
      customerId: "demo-drei",
      tenantId: "drei",
      address: { ...validAddress, postalCode: "0012" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("logistics.addressOutsideDeliveryArea");
  });

  it("404s an unknown addressId", async () => {
    const r = await getAddress("addr-nope");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.category).toBe("notFound");
  });

  it("rejects a malformed address (validation)", async () => {
    const r = await createAddress({
      customerId: "demo-drei",
      tenantId: "drei",
      address: { ...validAddress, line1: "", country: "AUT" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.category).toBe("validation");
  });
});
