import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  SessionContext,
  type SessionContextValue,
  type SessionCustomer,
} from "@/lib/session-context";
import { clearSession, loadSession, saveSession } from "@/lib/session-persistence";
import { useTenant } from "@/hooks/use-tenant";

/*
 * SessionProvider — "who is logged in" for the active tenant. Mounts under TenantProvider (session
 * is per-tenant) and inside QueryClientProvider. Starts null (so SSR and the first client render
 * match) and loads the persisted session in a mount effect, re-loading on a tenant change — a Drei
 * session must not carry into DreiGo. setSession/signOut write through to storage, and signOut also
 * drops cached customer data so the next user on the tab can't see the previous session's.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  // Start null so the server render and the FIRST client render match (hydration-safe) — the
  // server has no sessionStorage. Load the persisted session in an effect after mount, and
  // re-load whenever the tenant changes so a Drei session can't carry into DreiGo.
  const [session, setSessionState] = useState<SessionCustomer | null>(null);
  useEffect(() => {
    setSessionState(loadSession(tenant));
  }, [tenant]);

  const setSession = useCallback((next: SessionCustomer) => {
    saveSession(next);
    setSessionState(next);
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setSessionState(null);
    // Drop cached customer data so the next user on this tab never sees the previous session's
    // plan/balance/add-ons. removeQueries clears it rather than just marking it stale.
    queryClient.removeQueries();
  }, [queryClient]);

  const value = useMemo<SessionContextValue>(
    () => ({ session, setSession, signOut }),
    [session, setSession, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
