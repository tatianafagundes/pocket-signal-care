import { err, seamError, type SeamResult } from "@/services/seam-result";

/*
 * Shared mock-driver support. (Spec Req 9.3)
 *
 * Every mock seam driver uses these two helpers so behaviour is consistent across CPR / ECM /
 * EOC / ECEV / DSIMA and not re-implemented five times:
 *
 *  - simulateLatency(): 300–900ms, so loading/skeleton states are real in the demo.
 *  - forced-error mode: a per-operation switch to make any mock op fail on demand, exercising
 *    the recovery paths (retry, inline error) without needing a real backend outage. Ops are
 *    named "<seam>.<op>" (e.g. "charging.topUp"). Off by default — the demo is happy-path until
 *    a failure is armed (e.g. from a dev control or a test).
 */

/** 300–900ms simulated network latency. */
export function simulateLatency(): Promise<void> {
  const ms = 300 + Math.floor(Math.random() * 600);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Operation ids currently armed to fail. Module-level so it persists across calls in a session.
const forcedErrors = new Set<string>();

/** Arm an operation to fail on its next call(s), e.g. forceError("charging.topUp"). */
export function forceError(op: string): void {
  forcedErrors.add(op);
}

/** Disarm a forced error (or all, with no argument). */
export function clearForcedError(op?: string): void {
  if (op) forcedErrors.delete(op);
  else forcedErrors.clear();
}

/** Is this operation currently armed to fail? */
export function isForced(op: string): boolean {
  return forcedErrors.has(op);
}

/**
 * Run the latency, then — if `op` is armed — return a forced SeamError instead of calling `fn`.
 * Mock drivers wrap each op with this: `return withMock("charging.topUp", () => ok(...))`.
 * The forced error is a retryable `unavailable` by default so the UI shows a retry path; a
 * driver can still return its own domain errors from `fn` normally.
 */
export async function withMock<T>(
  op: string,
  fn: () => Promise<SeamResult<T>> | SeamResult<T>,
): Promise<SeamResult<T>> {
  await simulateLatency();
  if (isForced(op)) {
    return err(seamError(`${op}.forced`, "unavailable", "retry", "Forced mock failure (demo)."));
  }
  return fn();
}
