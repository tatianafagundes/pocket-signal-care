import { useTranslation } from "react-i18next";

/*
 * useLocalizedTranslation — the app's translation hook.
 *
 * It is just the plain react-i18next useTranslation(), which is bound to the live i18n language
 * and re-renders the component whenever i18n.changeLanguage fires (what the language selector
 * triggers via the TenantProvider). That is what makes switching to DE actually translate.
 *
 * Why no hydration guard: i18n initialises with lng "en" (the product default), and the
 * TenantProvider only changes the language in an effect AFTER mount. So the server render and
 * the first client render are BOTH "en" — there is no hydration mismatch to guard against. An
 * earlier version pinned the first paint to a fixed-T("en") via useHydrated(); that guard was
 * redundant (nothing mismatches) and could get stuck returning "en" because useHydrated's
 * no-op subscribe never re-notified React, so the UI never left English. Removed.
 *
 * Kept as a thin wrapper (not inlined to useTranslation at call sites) so a future per-tenant
 * namespace or locale policy has one place to live.
 */
export function useLocalizedTranslation() {
  return useTranslation();
}
