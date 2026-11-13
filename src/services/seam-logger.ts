/*
 * seam-logger — the single sink for seam operation telemetry. (Code-review P2: observability)
 *
 * Every seam op (via seam-runtime's runRead/runWrite) reports one line here: what ran, for which
 * tenant, under which correlation id, how long it took, and whether it failed. This is METADATA
 * ONLY — never a payload, never PII (no email/msisdn/token/password). That rule is load-bearing:
 * the log may ship to a collector in production, so it must carry nothing personal.
 *
 * Why structured JSON in production: an operator queries fields (op, status, correlationId), not
 * prose — the industry norm for production logging. In dev we keep a short human-readable line so
 * the console stays legible while working. (See the P2 review note and the referenced guidance.)
 *
 * Fase 8 hook: replace the `emit` body with a real logger/collector (OTel, Sentry breadcrumb, etc.)
 * WITHOUT touching any seam — this module is the only place that decides HOW a seam op is recorded.
 */

export interface SeamLogRecord {
  /** The operation id, e.g. "cpr.getCustomer360". */
  op: string;
  /** The tenant the op ran for (or the seam-name placeholder until real tenancy lands — see P2). */
  tenantId: string;
  /** Correlation id tying related ops together (one request → one id across its fan-out). */
  correlationId: string;
  /** Outcome. */
  status: "ok" | "error";
  /** Wall-clock duration in milliseconds. */
  ms: number;
  /** The SeamError.code when status is "error" (a code, never a message with data). */
  errorCode?: string;
}

/**
 * Record one seam operation. DEV → a compact, readable console line. PROD → one structured JSON
 * line on console.info (a collector can parse it). Test → silent (no console noise in the suite).
 */
export function logSeamOp(record: SeamLogRecord): void {
  if (import.meta.env.MODE === "test") return;

  if (import.meta.env.DEV) {
    const tail = record.errorCode ? ` (${record.errorCode})` : "";
    console.debug(
      `[seam] ${record.op} tenant=${record.tenantId} cid=${record.correlationId} ` +
        `${record.status} ${record.ms}ms${tail}`,
    );
    return;
  }

  // Production: structured, machine-queryable, metadata-only.
  console.info(
    JSON.stringify({
      kind: "seam-op",
      ...record,
    }),
  );
}

/**
 * A short, unique-enough correlation id for one request/op. Uses crypto.randomUUID when available
 * (browser + modern node/bun), with a tiny fallback so a missing crypto never throws. Not a
 * security token — purely for log correlation.
 */
export function newCorrelationId(): string {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return uuid.slice(0, 8);
}
