import { api } from "@/services/api";
import type { Balance } from "@/services/model";
import type { TopUpProgress } from "@/lib/topup-progress";

/*
 * Top-up payment orchestration. (Top-up flow — the three money moments.)
 *
 * Runs (or resumes) a prepaid top-up against the seams, in order:
 *
 *   authorize (reserve on the tokenized method, no charge)
 *     → capture (charge at the milestone; mock: synchronous)
 *     → topUp  (credit the amount onto the prepaid balance; extends validity — CBEV FC34)
 *
 * WHY AUTHORIZE FIRST: a declined card must cost nothing. If authorize fails we stop before
 * capturing or crediting. (Same money-moment order as onboarding activation.)
 *
 * IDEMPOTENT RETRY — never double-charge: each milestone is persisted via `patch` the instant its
 * seam returns, and REUSED on a retry rather than repeated:
 *   - authorizationRef : skip authorize if present (authorize is NOT idempotent — it mints a new
 *       ref each call, so re-authorizing WOULD double-charge; this guard is what prevents it)
 *   - captured         : skip capture if already done (capture is also idempotent on the ref in the
 *       mock, but the flag avoids a needless round-trip)
 *   - credited         : skip topUp if already done
 * So a reload between capture and credit resumes at credit — authorize once, capture once, credit
 * once. The progress is persisted in sessionStorage by the caller (see lib/topup-progress); the
 * methodToken is NEVER persisted or logged.
 *
 * On any seam failure the SeamFailure bubbles to the page; partial progress is already persisted
 * for an idempotent retry. Money is minor units + EUR. The amount authorized, captured and
 * credited are the SAME value (a pure top-up, unlike onboarding where extras are paid but not
 * credited).
 */

export interface RunTopUpDeps {
  customerId: string;
  /** Top-up amount in minor units (euro cents). Authorized, captured and credited — all the same. */
  amountMinor: number;
  /** Opaque (mock) payment-method token. Never a PAN; never persisted or logged. */
  methodToken: string;
  /** The current persisted progress (empty on a first attempt, partial on a resume). */
  progress: TopUpProgress;
  /** Persist a progress change the instant a milestone completes (sessionStorage, by the caller). */
  patch: (next: TopUpProgress) => void;
}

/** What a completed top-up yields — enough for the success receipt. */
export interface TopUpResult {
  /** The balance after crediting (new amount + extended validity). */
  balance: Balance;
  /** The payment authorization reference — shown on the receipt as the transaction reference. */
  authorizationRef: string;
}

/**
 * Run or resume a top-up. Returns the new balance + the authorization reference on success. Throws
 * SeamFailure on any step; partial progress is persisted via `patch` for an idempotent retry.
 */
export async function runTopUp({
  customerId,
  amountMinor,
  methodToken,
  progress,
  patch,
}: RunTopUpDeps): Promise<TopUpResult> {
  // Money boundary: a non-positive amount must never reach authorize/topUp. The amount screen gates
  // this, but this is the reusable-function backstop so no caller can authorize a €0 top-up.
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new Error("runTopUp: amountMinor must be a positive integer (minor units)");
  }

  // Local working copy; each milestone updates it AND persists via patch.
  let current: TopUpProgress = { ...progress };

  // 1. Authorize — reserve on the tokenized method, no charge. Reuse an existing ref on retry
  //    (never authorize the card twice).
  let authorizationRef = current.authorizationRef;
  if (!authorizationRef) {
    const auth = await api.authorizePayment({ customerId, amountMinor, methodToken });
    authorizationRef = auth.authorizationRef;
    current = { ...current, authorizationRef };
    patch(current);
  }

  // 2. Capture — charge the authorized amount. Skip if already captured.
  if (!current.captured) {
    await api.capturePayment({ authorizationRef });
    current = { ...current, captured: true };
    patch(current);
  }

  // 3. Credit — top up the balance (grows amount + extends validity). Skip the CREDIT itself if
  //    already done (never credit twice); on that resume path read the current balance instead so
  //    the result screen still gets a Balance to show.
  if (!current.credited) {
    const balance = await api.topUp({ customerId, amountMinor });
    current = { ...current, credited: true };
    patch(current);
    return { balance, authorizationRef };
  }
  // Already credited on a prior attempt — fetch the current balance (never re-credit).
  const existing = await api.getBalance(customerId);
  if (existing === null) {
    // A credited top-up with no balance record is impossible in practice; fail loudly rather than
    // fabricate a Balance.
    throw new Error("runTopUp: credited but no balance record found");
  }
  return { balance: existing, authorizationRef };
}
