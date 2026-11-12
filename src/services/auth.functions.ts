import { seamError, type SeamResult } from "@/services/seam-result";
import { runWrite } from "@/services/seam-runtime";
import { authDriverOrThrow } from "@/services/driver-config";
import type { Session } from "@/services/model";
import { credentialsSchema } from "@/schemas/auth";
import type { AuthDriver } from "@/services/auth/auth-driver";
import { createAuthMock } from "@/services/auth/auth-mock";
import { createAuthHttp } from "@/services/auth/auth-http";

/*
 * Auth seam. (Spec Fase 5 / onboarding-journey Req 4) register + login.
 *
 * Same shape as the other seams: Zod-validate → runWrite → driver. Uses authDriverOrThrow()
 * (NOT driverFor directly) so the mock can never be the driver in a production build.
 * register/login are writes (they create a session / account), so they go through runWrite.
 */

const driver: AuthDriver = authDriverOrThrow() === "http" ? createAuthHttp() : createAuthMock();

export function registerAccount(input: unknown): Promise<SeamResult<Session>> {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) {
    return Promise.resolve<SeamResult<Session>>({
      ok: false,
      error: seamError("auth.register.invalid", "validation", "fixInput"),
    });
  }
  return runWrite({ tenantId: parsed.data.tenantId }, "auth.register", () =>
    driver.register(parsed.data),
  );
}

export function loginAccount(input: unknown): Promise<SeamResult<Session>> {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) {
    return Promise.resolve<SeamResult<Session>>({
      ok: false,
      error: seamError("auth.login.invalid", "validation", "fixInput"),
    });
  }
  return runWrite({ tenantId: parsed.data.tenantId }, "auth.login", () =>
    driver.login(parsed.data),
  );
}
