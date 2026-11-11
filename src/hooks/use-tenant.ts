import { useContext } from "react";

import { TenantContext, type TenantContextValue } from "@/lib/tenant-context";

export function useTenant(): TenantContextValue {
  const context = useContext(TenantContext);
  if (!context) throw new Error("useTenant must be used within <TenantProvider>");
  return context;
}
