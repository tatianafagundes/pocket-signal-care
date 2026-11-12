import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  SessionContext,
  type SessionContextValue,
  type SessionCustomer,
} from "@/lib/session-context";
import { clearSession, loadSession, saveSession } from "@/lib/session-persistence";
import { useTenant } from "@/hooks/use-tenant";

/*
 * SessionProvider — "who is logged in" for the active tenant. Mounts under TenantProvider (session
 * is per-tenant) and inside QueryClientProvider. Lazy-inits from sessionStorage (SSR-safe: null on
 * the server and first client render, so hydration matches), persists on every change.
 *
 * If the tenant changes (brand switch), the session is re-loaded for the new tenant — a Drei
 * session must not carry into DreiGo. setSession/signOut write through to storage.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const { tenant } = useTenant();
  const [session, setSessionState] = useState<SessionCustomer | null>(() => loadSession(tenant));

  // Re-load the session when the tenant changes (client only; first render already lazy-loaded).
  const prevTenant = useRef(tenant);
  useEffect(() => {
    if (prevTenant.current !== tenant) {
      prevTenant.current = tenant;
      setSessionState(loadSession(tenant));
    }
  }, [tenant]);

  const setSession = useCallback((next: SessionCustomer) => {
    saveSession(next);
    setSessionState(next);
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setSessionState(null);
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ session, setSession, signOut }),
    [session, setSession, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
