import { useHydrated } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

/*
 * useLocalizedTranslation — translation that is hydration-safe AND reactive to locale changes.
 *
 * The SSR server renders in "en" (i18n default). To avoid a hydration mismatch, a boundary must
 * also render "en" on its first client paint, until it has hydrated. After hydration we return
 * the PLAIN useTranslation() `t`, which is bound to the live i18n language and re-renders the
 * component whenever i18n.changeLanguage fires (what the language selector triggers via the
 * TenantProvider). Before hydration we return a fixed-T pinned to "en".
 *
 * Why not useTranslation(ns, { lng }) for both cases: passing the `lng` option returns a
 * getFixedT bound to that language and does NOT re-subscribe on languageChanged, so the UI
 * would not update when the user switches locale. Using the plain hook post-hydration fixes
 * the "clicking DE doesn't translate" bug while keeping the pre-hydration paint on "en".
 */
export function useLocalizedTranslation() {
  const hydrated = useHydrated();
  const translation = useTranslation();

  if (!hydrated) {
    // Pre-hydration: pin to the server language so the first client paint matches SSR.
    return { ...translation, t: translation.i18n.getFixedT("en") };
  }
  return translation;
}
