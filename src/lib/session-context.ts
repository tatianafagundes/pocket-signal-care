import { createContext } from "react";

import type { SessionOrigin } from "@/services/model";
import type { TenantId } from "@/lib/tenant-rules";

/*
 * Session context. (Fase 8 — the "who is logged in" the app lacked)
 *
 * Holds the current customer for the active tenant: the id the data screens (my-plan, add-ons)
 * query by, plus the email/name to greet them and the origin so a real IdP swap stays honest.
 *
 * NO TOKEN HERE. The auth token is a credential; like the password it never goes to sessionStorage
 * in this phase. A real IdP (Fase 8) keeps the token in an httpOnly cookie, not JS-readable state.
 * The session store carries only non-secret identity: customerId, email, name, tenant, origin.
 *
 * Context identity lives in src/lib/ (outside the provider/hook) for Fast Refresh stability —
 * the same 3-file split as the tenant and onboarding contexts.
 */

/** The logged-in customer, or null when signed out. Non-secret identity only. */
export interface SessionCustomer {
  customerId: string;
  email: string;
  tenantId: TenantId;
  /** Given name for a greeting, when known. */
  givenName: string | null;
  /** Where the session came from — a real driver must refuse a "mock" session. */
  origin: SessionOrigin;
}

export interface SessionContextValue {
  /** The current session, or null when nobody is signed in. */
  session: SessionCustomer | null;
  /** Start a session (auto-login after onboarding, or a successful login). */
  setSession: (session: SessionCustomer) => void;
  /** End the session. */
  signOut: () => void;
}

// Keep context identity outside refreshable components and hooks (Fast Refresh stability).
export const SessionContext = createContext<SessionContextValue | null>(null);
