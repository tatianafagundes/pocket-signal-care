import type { TenantId } from "@/lib/tenant-rules";

/*
 * Top-up progress persistence. (Top-up flow — idempotency / anti double-charge.)
 *
 * A top-up is three money moments: authorize → capture → credit. If the page reloads AFTER the card
 * is authorized/captured but BEFORE the balance is credited, an in-memory-only flow would re-run
 * from the start and authorize the card a SECOND time — a real double-charge. So the three
 * milestones are persisted and reused on resume (the same idempotency contract onboarding uses).
 *
 * What is stored: ONLY `{ authorizationRef, captured, credited }` plus the amount+customer it
 * belongs to and a timestamp. The payment token and PAN are NEVER stored here (or anywhere) — the
 * authorizationRef is an opaque server reference, not a credential.
 *
 * Storage: sessionStorage (tab-scoped — a half-finished top-up should not resurrect in a new
 * session) with a short TTL. Scoped to tenant+customer+amount: a different amount is a different
 * top-up and must start clean (never resume someone's €20 authorize as a €50 top-up). SSR-safe.
 */

const STORAGE_KEY = "topup-progress:v1";
/** A half-finished top-up is only resumable briefly; beyond this it starts clean. */
export const TOPUP_PROGRESS_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface TopUpProgress {
  /** Payment authorization reference (opaque). Absent until authorize succeeds. */
  authorizationRef?: string;
  /** Whether the authorized payment has been captured. */
  captured: boolean;
  /** Whether the balance has been credited (the top-up is complete). */
  credited: boolean;
}

interface Envelope extends TopUpProgress {
  savedAt: number;
  tenant: TenantId;
  customerId: string;
  amountMinor: number;
}

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

/** The clean starting progress — nothing done yet. */
export function emptyTopUpProgress(): TopUpProgress {
  return { captured: false, credited: false };
}

/**
 * Load persisted progress for exactly this tenant+customer+amount, or the clean empty progress.
 * A mismatch on any of tenant/customer/amount, a bad shape, or an expired envelope → start clean
 * (so a reload never resumes the wrong top-up). Safe on the server.
 */
export function loadTopUpProgress(
  tenant: TenantId,
  customerId: string,
  amountMinor: number,
  now: number = Date.now(),
): TopUpProgress {
  if (!hasWindow()) return emptyTopUpProgress();
  try {
    const rawJson = window.sessionStorage.getItem(STORAGE_KEY);
    if (!rawJson) return emptyTopUpProgress();
    const raw = JSON.parse(rawJson) as Partial<Envelope>;
    if (typeof raw.savedAt !== "number" || now - raw.savedAt > TOPUP_PROGRESS_TTL_MS) {
      return emptyTopUpProgress();
    }
    if (raw.tenant !== tenant || raw.customerId !== customerId || raw.amountMinor !== amountMinor) {
      return emptyTopUpProgress();
    }
    return {
      ...(typeof raw.authorizationRef === "string"
        ? { authorizationRef: raw.authorizationRef }
        : {}),
      captured: raw.captured === true,
      credited: raw.credited === true,
    };
  } catch {
    return emptyTopUpProgress();
  }
}

/** Persist progress for this tenant+customer+amount with a fresh timestamp. No-op on the server. */
export function saveTopUpProgress(
  tenant: TenantId,
  customerId: string,
  amountMinor: number,
  progress: TopUpProgress,
): void {
  if (!hasWindow()) return;
  try {
    const env: Envelope = {
      savedAt: Date.now(),
      tenant,
      customerId,
      amountMinor,
      ...(progress.authorizationRef ? { authorizationRef: progress.authorizationRef } : {}),
      captured: progress.captured,
      credited: progress.credited,
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(env));
  } catch {
    // storage full / disabled — the flow still works in-memory for this attempt.
  }
}

/** Clear persisted top-up progress (on success, or when starting a fresh top-up). No-op on server. */
export function clearTopUpProgress(): void {
  if (!hasWindow()) return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
