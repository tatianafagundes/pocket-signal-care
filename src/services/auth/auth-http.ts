import { err, seamError, type SeamResult } from "@/services/seam-result";
import type { Account, Session } from "@/services/model";
import type { AuthDriver } from "@/services/auth/auth-driver";

/*
 * Auth http driver — STUB (Keycloak OIDC). (Spec Fase 5 / Fase 8 integration point)
 *
 * Selected when VITE_AUTH_DRIVER=http (the only value driverFor accepts; anything else → mock).
 * Not implemented for the demo: it returns a clear
 * "not implemented" SeamError. This file DOCUMENTS the real flow so Fase 8 has a map.
 *
 * Keycloak (OIDC) — the intended real flow:
 *   register → OIDC has no "register" grant. An account is created either by the realm's
 *              self-registration page, or server-side via the Keycloak Admin REST API
 *              (POST /admin/realms/{realm}/users). The SPA does NOT hold admin credentials.
 *   login    → Authorization Code Flow + PKCE (redirect to Keycloak, code → token exchange).
 *              Returns access_token (JWT) + refresh_token. The JWT carries the tenant; the app
 *              then sends `Authorization: Bearer <JWT>` and `X-Tenant-Id` on seam calls.
 *   changeEmail → Keycloak Admin REST API (PUT /admin/realms/{realm}/users/{id}), done
 *              server-side for the signed-up user; the SPA never holds admin credentials.
 *   NEVER use the Resource Owner Password Credentials (ROPC) grant — it exposes the password to
 *   the client and is deprecated in OAuth 2.1. Use Authorization Code + PKCE with state+nonce.
 *   Token storage must be secure (httpOnly cookie via a backend, or the adapter's storage) —
 *   the mock deliberately does NOT solve this; it is the integration point.
 *
 * Supabase (the Lovable-native alternative) would map to supabase.auth.signUp /
 * signInWithPassword, with the Session's origin set to "supabase".
 */
export function createAuthHttp(): AuthDriver {
  const notImplemented = <T>(op: string): SeamResult<T> =>
    err(
      seamError(
        `auth.${op}.notImplemented`,
        "unavailable",
        "contactSupport",
        "Keycloak auth driver is a stub; integration is Fase 8.",
      ),
    );

  return {
    register(): Promise<SeamResult<Session>> {
      return Promise.resolve(notImplemented<Session>("register"));
    },
    login(): Promise<SeamResult<Session>> {
      return Promise.resolve(notImplemented<Session>("login"));
    },
    changeEmail(): Promise<SeamResult<Account>> {
      return Promise.resolve(notImplemented<Account>("changeEmail"));
    },
  };
}
