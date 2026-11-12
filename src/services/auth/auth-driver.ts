import type { SeamResult } from "@/services/seam-result";
import type { Credentials, Session } from "@/services/model";

/*
 * AuthDriver — the interface the mock and the http (Keycloak) client implement. (Spec Fase 5)
 *
 * The seam talks only to this; driverFor('auth') picks the impl. Never throws → SeamResult.
 * The password lives only inside the Credentials argument here and is discarded by the driver
 * after validation — it is never returned, stored, or logged.
 */
export interface AuthDriver {
  /** Create an account + return a session. Fails on invalid input or an email already in use. */
  register(credentials: Credentials): Promise<SeamResult<Session>>;
  /** Authenticate. In the mock, any format-valid credential succeeds (demo); the real IdP checks. */
  login(credentials: Credentials): Promise<SeamResult<Session>>;
}
