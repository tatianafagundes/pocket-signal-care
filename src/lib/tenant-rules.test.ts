import { describe, expect, it } from "vitest";

import {
  DEFAULT_TENANT,
  isTenantId,
  localeForTenant,
  resolveTenant,
  tenantName,
} from "./tenant-rules";

describe("tenant-rules", () => {
  describe("isTenantId", () => {
    it("accepts known tenants, case-insensitively", () => {
      expect(isTenantId("drei")).toBe(true);
      expect(isTenantId("dreigo")).toBe(true);
      expect(isTenantId("DreiGo")).toBe(true);
    });
    it("rejects unknown / empty values", () => {
      expect(isTenantId("acme")).toBe(false);
      expect(isTenantId("")).toBe(false);
      expect(isTenantId(null)).toBe(false);
      expect(isTenantId(undefined)).toBe(false);
    });
  });

  describe("per-tenant defaults", () => {
    it("Drei defaults to de-AT, DreiGo to en", () => {
      expect(localeForTenant("drei")).toBe("de-AT");
      expect(localeForTenant("dreigo")).toBe("en");
    });
    it("exposes display names", () => {
      expect(tenantName("drei")).toBe("Drei");
      expect(tenantName("dreigo")).toBe("DreiGo");
    });
  });

  describe("resolveTenant precedence", () => {
    it("resolves a known subdomain (highest precedence)", () => {
      const r = resolveTenant("dreigo.example.com", "?tenant=drei");
      expect(r.tenant).toBe("dreigo");
      expect(r.source).toBe("subdomain");
      expect(r.locale).toBe("en");
      expect(r.requestedUnknown).toBeNull();
    });

    it("resolves ?tenant= when there is no tenant subdomain", () => {
      const r = resolveTenant("app.example.com", "?tenant=dreigo");
      expect(r.tenant).toBe("dreigo");
      expect(r.source).toBe("query");
      expect(r.requestedUnknown).toBeNull();
    });

    it("accepts a bare (no leading ?) search string and is case-insensitive", () => {
      const r = resolveTenant("app.example.com", "tenant=DreiGo");
      expect(r.tenant).toBe("dreigo");
      expect(r.source).toBe("query");
    });

    it("defaults to Drei with no signal", () => {
      const r = resolveTenant("app.example.com", "");
      expect(r.tenant).toBe(DEFAULT_TENANT);
      expect(r.tenant).toBe("drei");
      expect(r.source).toBe("default");
      expect(r.locale).toBe("de-AT");
      expect(r.requestedUnknown).toBeNull();
    });

    it("defaults to Drei on localhost / www / bare host", () => {
      expect(resolveTenant("localhost", "").tenant).toBe("drei");
      expect(resolveTenant("www.example.com", "").tenant).toBe("drei");
      expect(resolveTenant("example.com", "").tenant).toBe("drei");
      expect(resolveTenant(null, null).tenant).toBe("drei");
    });

    it("strips a port from the hostname", () => {
      const r = resolveTenant("dreigo.example.com:5173", "");
      expect(r.tenant).toBe("dreigo");
      expect(r.source).toBe("subdomain");
    });
  });

  describe("unknown requested tenant recovers to default and reports it", () => {
    it("unknown ?tenant= -> default Drei + requestedUnknown", () => {
      const r = resolveTenant("app.example.com", "?tenant=acme");
      expect(r.tenant).toBe("drei");
      expect(r.source).toBe("default");
      expect(r.requestedUnknown).toBe("acme");
    });

    it("an unknown subdomain resolves to default silently (not a tenant request)", () => {
      // Only ?tenant= is an explicit tenant request; arbitrary subdomains are infrastructure.
      const r = resolveTenant("acme.example.com", "");
      expect(r.tenant).toBe("drei");
      expect(r.source).toBe("default");
      expect(r.requestedUnknown).toBeNull();
    });

    it("www / bare host / app subdomain are never an unknown requested tenant", () => {
      expect(resolveTenant("www.example.com", "").requestedUnknown).toBeNull();
      expect(resolveTenant("example.com", "").requestedUnknown).toBeNull();
      expect(resolveTenant("app.example.com", "").requestedUnknown).toBeNull();
    });
  });
});
