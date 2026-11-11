import { startTransition, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { TenantContext, type TenantContextValue } from "@/lib/tenant-context";
import { resolveTenant, tenantName, type Locale, type TenantResolution } from "@/lib/tenant-rules";
import { api, SeamFailure } from "@/services/api";

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
 * Tenant existence is confirmed against CPR via api.resolveTenant after the local resolve
 * (Fase 3.4). With the mock driver this always confirms; when VITE_CPR_DRIVER=http it hits the
 * real CPR. The confirmation only drives the not-found recovery banner — theming/locale apply
 * instantly from the local resolve so first paint is never blocked on the network.
 */

export function TenantProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();

  // First render (SSR + hydration) uses the default tenant so server and client markup match.
  const [resolution, setResolution] = useState<TenantResolution>(() => resolveTenant(null, null));
  // A user-chosen locale overrides the tenant default once set.
  const [localeOverride, setLocaleOverride] = useState<Locale | null>(null);

  // Re-resolve from the real URL after mount (client only).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const { hostname, search } = window.location;
    const r = resolveTenant(hostname, search);
    // Lazy route boundaries must hydrate before their tenant-dependent content changes.
    startTransition(() => {
      setResolution(r);
    });

    // Confirm the resolved tenant actually exists in CPR (Fase 3.4 — resolves the Fase 2 TODO).
    // Theming already applied from the local resolve above; this only surfaces the recovery
    // banner if the backend says the tenant is unknown. Never throws into render.
    let cancelled = false;
    void api
      .resolveTenant(r.tenant)
      .then((res) => {
        if (!cancelled && !res.exists) {
          setResolution((prev) => ({ ...prev, requestedUnknown: prev.tenant }));
        }
      })
      .catch((e: unknown) => {
        // A SeamFailure here means CPR is unreachable, not that the tenant is invalid — don't
        // punish the user with the not-found banner for a backend blip. Log and keep the brand.
        if (import.meta.env.DEV) {
          console.debug(
            "[tenant] resolveTenant confirm failed:",
            e instanceof SeamFailure ? e.code : e,
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const locale = localeOverride ?? resolution.locale;

  // Apply the brand theme to <html>, keep i18n in sync, and set the tab title to the brand.
  // (The SSR title is brand-neutral since the tenant isn't resolved server-side yet — Phase 3.)
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-brand", resolution.tenant);
      document.documentElement.setAttribute("lang", locale);
      document.title = `${tenantName(resolution.tenant)} — Prepaid mobile self-care`;
    }
  }, [resolution.tenant, locale]);

  useEffect(() => {
    if (i18n.language === locale) return;
    // Translation updates must not interrupt hydration of a deferred route boundary.
    startTransition(() => {
      void i18n.changeLanguage(locale);
    });
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
