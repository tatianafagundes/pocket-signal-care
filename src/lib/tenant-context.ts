import { createContext } from "react";

import type { Locale, TenantId } from "@/lib/tenant-rules";

export interface TenantContextValue {
  tenant: TenantId;
  tenantName: string;
  locale: Locale;
  source: "subdomain" | "query" | "default";
  requestedUnknown: string | null;
  setLocale: (locale: Locale) => void;
}

// Keep context identity outside refreshable components and hooks.
export const TenantContext = createContext<TenantContextValue | null>(null);
