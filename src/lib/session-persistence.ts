import type { SessionCustomer } from "@/lib/session-context";
import { isTenantId, type TenantId } from "@/lib/tenant-rules";
import type { SessionOrigin } from "@/services/model";

/*
 * Session persistence. The signed-in customer survives a refresh within the session (sessionStorage,
 * scoped to the tab — a session should not silently outlive the browser session). Tenant-scoped:
 * a session for another brand is ignored. Reads are defensive (malformed → signed out). No token is
 * ever stored (see session-context). SSR-safe: null on the server.
 */

const STORAGE_KEY = "session:v1";

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function isOrigin(v: unknown): v is SessionOrigin {
  return v === "mock" || v === "keycloak" || v === "supabase";
}

/** Validate a parsed value into a trusted SessionCustomer for `tenant`, or null. */
function revive(raw: unknown, tenant: TenantId): SessionCustomer | null {
  if (typeof raw !== "object" || raw === null) return null;
  const s = raw as Partial<SessionCustomer>;
  if (typeof s.customerId !== "string" || s.customerId.length === 0) return null;
  if (typeof s.email !== "string") return null;
  if (!isTenantId(s.tenantId) || s.tenantId !== tenant) return null;
  if (!isOrigin(s.origin)) return null;
  return {
    customerId: s.customerId,
    email: s.email,
    tenantId: tenant,
    givenName: typeof s.givenName === "string" ? s.givenName : null,
    origin: s.origin,
  };
}

/** Load the persisted session for `tenant`, or null. Safe on the server. */
export function loadSession(tenant: TenantId): SessionCustomer | null {
  if (!hasWindow()) return null;
  try {
    const rawJson = window.sessionStorage.getItem(STORAGE_KEY);
    if (!rawJson) return null;
    return revive(JSON.parse(rawJson), tenant);
  } catch {
    return null;
  }
}

/** Persist the session. No-op on the server. Never throws. */
export function saveSession(session: SessionCustomer): void {
  if (!hasWindow()) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // storage full / disabled — the session still works in-memory this session.
  }
}

/** Clear the persisted session. No-op on the server. Never throws. */
export function clearSession(): void {
  if (!hasWindow()) return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
