/*
 * SeamResult — the result type every seam operation returns. (Spec Fase 0.3)
 *
 * Copied from the telco-docs-compass pattern: a seam NEVER throws. It returns
 * `{ ok: true, data }` or `{ ok: false, error: SeamError }`. The single port (api.ts)
 * turns a `{ ok: false }` into a thrown `SeamFailure` for the UI via `unwrap()`.
 *
 * `customerFacing.key` is an i18n key the UI maps to copy; `detail` is a plain-language,
 * non-personal reason (e.g. "MSISDN already reserved"). `retryable` is derived from category.
 */

export interface SeamError {
  code: string;
  category: "validation" | "notFound" | "conflict" | "rejected" | "unavailable" | "unknown";
  retryable: boolean;
  customerFacing?: {
    key: string;
    recoverable?: boolean;
    nextAction?: "retry" | "fixInput" | "contactSupport" | "none";
    /** Plain-language reason that may be shown. Never personal data. */
    detail?: string;
  };
}

export type SeamErr = { ok: false; error: SeamError };
export type SeamResult<T> = { ok: true; data: T } | SeamErr;

/** The single SeamError constructor. `retryable` is derived (only "unavailable" retries). */
export function seamError(
  code: string,
  category: SeamError["category"],
  nextAction: NonNullable<SeamError["customerFacing"]>["nextAction"] = "none",
  detail?: string,
): SeamError {
  return {
    code,
    category,
    retryable: category === "unavailable",
    customerFacing: {
      key: code,
      recoverable: nextAction !== "none",
      nextAction,
      ...(detail ? { detail } : {}),
    },
  };
}

/** Convenience constructors for the common ok/err shapes. */
export function ok<T>(data: T): SeamResult<T> {
  return { ok: true, data };
}
export function err(error: SeamError): SeamErr {
  return { ok: false, error };
}
