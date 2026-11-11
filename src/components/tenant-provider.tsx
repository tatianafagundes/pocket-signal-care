import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import {
  DEFAULT_TENANT,
  localeForTenant,
  resolveTenant,
  tenantName,
  type Locale,
  type TenantId,
} from "@/lib/tenant-rules";

/*
 * TenantProvider — the white-label runtime. (Spec Fase 2.2)
 *
 * Resolves the active tenant from the URL (pure rules in lib/tenant-rules), applies it as the
 * brand theme by setting <html data-brand="…"> (the whole brand swap; colours live in
 * tokens.css), and syncs the i18n language to the tenant's default locale. The resolved tenant
 * and a manual locale switch are exposed via context so the shell (app-bar, language selector)
 * and later journeys can read them.
 *
 * SSR note: TanStack Start renders on the server where `window` is absent. We resolve with the
 * default tenant during SSR and the first client render, then re-resolve from the real URL in
 * an effect — so the markup is stable and hydration-safe, and the brand/locale settle on the
 * client. __root.tsx hardcodes data-brand="drei" (the default) for first paint; this provider
 * takes over and updates it.
 *
 * Fase 3 TODO: once api.resolveTenant exists (CPR seam), confirm the resolved tenant actually
 * exists server-side and drive `status` from that call instead of the local known-list check.
 */

interface TenantContextValue {
  tenant: TenantId;
  tenantName: string;
  /** Active locale (tenant default unless the user switched it). */
  locale: Locale;
  /** Where the tenant id came from. */
  source: "subdomain" | "query" | "default";
  /** A tenant was explicitly requested via ?tenant= but is unknown; app fell back to default. */
  requestedUnknown: string | null;
  /** Switch the UI language (does not change the tenant). */
  setLocale: (locale: Locale) => void;
}

const TenantContext = createContext<TenantContextValue | null>(null);

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used within <TenantProvider>");
  return ctx;
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();

  // First render (SSR + hydration) uses the default tenant so server and client markup match.
  const [resolution, setResolution] = useState(() => ({
    tenant: DEFAULT_TENANT,
    locale: localeForTenant(DEFAULT_TENANT),
    source: "default" as const,
    requestedUnknown: null as string | null,
  }));
  // A user-chosen locale overrides the tenant default once set.
  const [localeOverride, setLocaleOverride] = useState<Locale | null>(null);

  // Re-resolve from the real URL after mount (client only).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const { hostname, search } = window.location;
    const r = resolveTenant(hostname, search);
    setResolution({
      tenant: r.tenant,
      locale: r.locale,
      source: r.source,
      requestedUnknown: r.requestedUnknown,
    });
  }, []);

  const locale = localeOverride ?? resolution.locale;

  // Apply the brand theme to <html> and keep i18n in sync with the active locale.
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-brand", resolution.tenant);
      document.documentElement.setAttribute("lang", locale);
    }
  }, [resolution.tenant, locale]);

  useEffect(() => {
    if (i18n.language !== locale) void i18n.changeLanguage(locale);
  }, [i18n, locale]);

  const value = useMemo<TenantContextValue>(
    () => ({
      tenant: resolution.tenant,
      tenantName: tenantName(resolution.tenant),
      locale,
      source: resolution.source,
      requestedUnknown: resolution.requestedUnknown,
      setLocale: setLocaleOverride,
    }),
    [resolution.tenant, resolution.source, resolution.requestedUnknown, locale],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}
