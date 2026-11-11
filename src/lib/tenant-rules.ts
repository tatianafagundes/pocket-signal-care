/*
 * Tenant resolution — pure rules, no I/O. (Spec Fase 2.1)
 *
 * The app is white-labelled across tenants (brands). The active tenant is resolved from the
 * request, deterministically, with a safe default. These functions take plain inputs
 * (hostname, query string) rather than reading `window`, so they are unit-testable and run
 * the same on server and client.
 *
 * Resolution order (first match wins):
 *   1. subdomain of a known tenant  (dreigo.example.com -> "dreigo")
 *   2. ?tenant= query param         (…?tenant=dreigo    -> "dreigo")
 *   3. default                      -> "drei" (the host operator)
 *
 * An unknown value never themes the app as that value: resolveTenant reports it as not found
 * and the caller recovers to the default (see TenantProvider). The brand swap itself is one
 * CSS attribute (<html data-brand>), wired in src/styles/tokens.css.
 */

export const TENANT_IDS = ["drei", "dreigo"] as const;
export type TenantId = (typeof TENANT_IDS)[number];

export const DEFAULT_TENANT: TenantId = "drei";

/** The two supported locales (see src/i18n.ts). */
export type Locale = "en" | "de-AT";

/** Per-tenant default locale (DESIGN.md: Drei -> de-AT, DreiGo -> en-US). User can switch. */
const TENANT_DEFAULT_LOCALE: Record<TenantId, Locale> = {
  drei: "de-AT",
  dreigo: "en",
};

/** Human-readable brand name, for the "Tenant detected: <name>" state and the wordmark alt. */
const TENANT_NAME: Record<TenantId, string> = {
  drei: "Drei",
  dreigo: "DreiGo",
};

/** True when `value` is one of the known tenant ids. Narrows the type. */
export function isTenantId(value: string | null | undefined): value is TenantId {
  return value != null && (TENANT_IDS as readonly string[]).includes(value.toLowerCase());
}

/** Default locale for a tenant. */
export function localeForTenant(tenant: TenantId): Locale {
  return TENANT_DEFAULT_LOCALE[tenant];
}

/** Display name for a tenant. */
export function tenantName(tenant: TenantId): string {
  return TENANT_NAME[tenant];
}

/**
 * Extract a candidate tenant id from a hostname's first label, when it names a known tenant.
 * Ignores www, localhost, bare hosts and IPs. "dreigo.app.com" -> "dreigo"; "app.com" -> null.
 */
function tenantFromHostname(hostname: string | null | undefined): TenantId | null {
  if (!hostname) return null;
  const host = hostname.split(":")[0]; // strip any :port
  const firstLabel = host?.split(".")[0]?.toLowerCase();
  if (!firstLabel || firstLabel === "www" || firstLabel === "localhost") return null;
  return isTenantId(firstLabel) ? firstLabel : null;
}

/**
 * Extract a candidate tenant id from a URL search string (`?tenant=…`). Accepts a raw search
 * string ("?tenant=dreigo" or "tenant=dreigo") or null. Returns null when absent/unknown.
 */
function tenantFromSearch(search: string | null | undefined): TenantId | null {
  if (!search) return null;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const value = params.get("tenant");
  return isTenantId(value) ? (value.toLowerCase() as TenantId) : null;
}

export interface TenantResolution {
  /** The tenant the app should render as — always a valid, known tenant. */
  tenant: TenantId;
  /** The default locale for that tenant. */
  locale: Locale;
  /** Where the id came from: a known tenant subdomain, the query param, or the default. */
  source: "subdomain" | "query" | "default";
  /**
   * A tenant was explicitly requested (subdomain or query) but is NOT a known tenant.
   * `tenant` falls back to the default; the caller may show a "tenant not found" recovery.
   * Carries the raw requested value for the message.
   */
  requestedUnknown: string | null;
}

/**
 * Resolve the active tenant from a hostname and a URL search string. Pure.
 * Precedence: known subdomain > ?tenant= > default. An explicitly requested but unknown
 * tenant yields the default tenant plus `requestedUnknown` set, so the UI can recover.
 */
export function resolveTenant(
  hostname: string | null | undefined,
  search: string | null | undefined,
): TenantResolution {
  const fromSubdomain = tenantFromHostname(hostname);
  if (fromSubdomain) {
    return {
      tenant: fromSubdomain,
      locale: localeForTenant(fromSubdomain),
      source: "subdomain",
      requestedUnknown: null,
    };
  }

  const fromQuery = tenantFromSearch(search);
  if (fromQuery) {
    return {
      tenant: fromQuery,
      locale: localeForTenant(fromQuery),
      source: "query",
      requestedUnknown: null,
    };
  }

  // Only an explicit ?tenant= is treated as a tenant request worth recovering from. An
  // arbitrary subdomain (app, staging, www…) is infrastructure, not a mistyped tenant, so a
  // non-matching subdomain resolves to the default silently — we don't guess intent from it.
  const requestedUnknown = readRawRequestedTenant(search);

  return {
    tenant: DEFAULT_TENANT,
    locale: localeForTenant(DEFAULT_TENANT),
    source: "default",
    requestedUnknown,
  };
}

/** Raw ?tenant= value (even if unknown), for the not-found message. */
function readRawRequestedTenant(search: string | null | undefined): string | null {
  if (!search) return null;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const value = params.get("tenant");
  return value && !isTenantId(value) ? value : null;
}
