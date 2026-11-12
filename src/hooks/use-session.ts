import { useContext } from "react";

import { SessionContext, type SessionContextValue } from "@/lib/session-context";

/*
 * useSession — read/update the signed-in customer. Must be used inside <SessionProvider> (mounted
 * in the root layout), so the guard turns a missing provider into a clear error, not a silent null.
 */
export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within <SessionProvider>");
  }
  return context;
}
