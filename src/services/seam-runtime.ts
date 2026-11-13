import { seamError, type SeamResult } from "@/services/seam-result";
import { logSeamOp, newCorrelationId } from "@/services/seam-logger";

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
 * ⚠️ This is the single choke point where Fase-8 authorization/RLS and the REAL tenant (today most
 * call-sites pass a seam-name placeholder, not the tenant) must land. See the consolidated anchor:
 * docs/design/2026-11-11-fase8-security-debt.md §1 (authorization) and §2 (seam-name vs tenant).
 *
 * runWrite currently mirrors runRead; it is kept distinct so writes can later add
 * idempotency/audit without touching call sites (every write already goes through it).
 */

export interface SeamContext {
  /** The active tenant id (drei | dreigo). Threaded for logging + future RLS. */
  tenantId: string;
  /**
   * Correlation id tying this op to the request that spawned it. Optional at the call site: a
   * standalone op (most of them) omits it and `run` mints a fresh one. A FAN-OUT (getCustomer360)
   * mints one id and passes it to every sub-call so all its ops share a single id in the logs —
   * the request-scoped correlation the observability guidance calls for. See newCorrelationId.
   */
  correlationId?: string;
}

/**
 * Build a SeamContext from a tenant and an optional correlation id. Use this instead of an inline
 * object so `correlationId: undefined` is never set (the tsconfig uses exactOptionalPropertyTypes,
 * which forbids an explicit `undefined` on an optional field) — the key is omitted when absent and
 * `run` mints a fresh id. A fan-out passes its id here so every sub-op shares it.
 */
export function seamCtx(tenantId: string, correlationId?: string): SeamContext {
  return correlationId ? { tenantId, correlationId } : { tenantId };
}

async function run<T>(
  ctx: SeamContext,
  op: string,
  fn: () => Promise<SeamResult<T>>,
): Promise<SeamResult<T>> {
  const correlationId = ctx.correlationId ?? newCorrelationId();
  const started = Date.now();
  try {
    const result = await fn();
    logSeamOp({
      op,
      tenantId: ctx.tenantId,
      correlationId,
      status: result.ok ? "ok" : "error",
      ms: Date.now() - started,
      ...(result.ok ? {} : { errorCode: result.error.code }),
    });
    return result;
  } catch {
    logSeamOp({
      op,
      tenantId: ctx.tenantId,
      correlationId,
      status: "error",
      ms: Date.now() - started,
      errorCode: "seam.unavailable",
    });
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
