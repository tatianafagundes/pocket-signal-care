import { useHydrated } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { useTenant } from "@/hooks/use-tenant";

export function useLocalizedTranslation() {
  const hydrated = useHydrated();
  const { locale } = useTenant();

  // Each deferred boundary keeps the server language until its own hydration completes.
  return useTranslation("translation", { lng: hydrated ? locale : "en" });
}
