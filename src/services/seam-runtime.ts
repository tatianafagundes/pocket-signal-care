import { seamError, type SeamResult } from "@/services/seam-result";

/*
 * seam-runtime — runRead / runWrite wrappers. (Spec Fase 0.3)
 *
 * Shape copied from telco-docs-compass: the wrapper owns logging and the try/catch →
 * SeamResult boundary, so a seam function only expresses the happy path and returns
 * `{ ok: true, data }` / `seamError(...)`. Anything the function throws becomes a
 * retryable `seam.unavailable` instead of crashing a screen.
 *
 * Divergence from the reference (documented): the reference binds runRead/runWrite to
 * Supabase RLS + an idempotency table. This demo runs on in-memory mock drivers (CPR real
 * comes in Fase 8), so there is no DB/RLS layer here yet. We keep the wrapper's contract —
 * never-throw, log op + tenant + ms + status — and leave room for the real auth/idempotency
 * checks to slot in when the http drivers land, without changing any seam or the UI.
 *
 * runWrite currently mirrors runRead; it is kept distinct so writes can later add
 * idempotency/audit without touching call sites (every write already goes through it).
 */

export interface SeamContext {
  /** The active tenant id (drei | dreigo). Threaded for logging + future RLS. */
  tenantId: string;
}

type LogStatus = "ok" | "error";

function logOp(op: string, tenantId: string, status: LogStatus, ms: number): void {
  // Logs metadata only — never payloads (no PII). Swap for the real logger in Fase 8.
  if (import.meta.env.DEV) {
    console.debug(`[seam] ${op} tenant=${tenantId} ${status} ${ms}ms`);
  }
}

async function run<T>(
  ctx: SeamContext,
  op: string,
  fn: () => Promise<SeamResult<T>>,
): Promise<SeamResult<T>> {
  const started = Date.now();
  try {
    const result = await fn();
    logOp(op, ctx.tenantId, result.ok ? "ok" : "error", Date.now() - started);
    return result;
  } catch {
    logOp(op, ctx.tenantId, "error", Date.now() - started);
    // A thrown error never reaches the UI as a crash — it becomes a retryable SeamError.
    return { ok: false, error: seamError("seam.unavailable", "unavailable", "retry") };
  }
}

/** Wrap a read operation. Never throws; returns a SeamResult. */
export function runRead<T>(
  ctx: SeamContext,
  op: string,
  fn: () => Promise<SeamResult<T>>,
): Promise<SeamResult<T>> {
  return run(ctx, op, fn);
}

/**
 * Wrap a write operation. Same guarantees as runRead today; kept separate so idempotency
 * and audit can be added here (Fase 8) without changing any call site.
 */
export function runWrite<T>(
  ctx: SeamContext,
  op: string,
  fn: () => Promise<SeamResult<T>>,
): Promise<SeamResult<T>> {
  return run(ctx, op, fn);
}
