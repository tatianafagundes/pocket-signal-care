import {
  ONBOARDING_STEPS,
  type OnboardingState,
  type OnboardingStep,
} from "@/lib/onboarding-context";
import { isTenantId, type TenantId } from "@/lib/tenant-rules";

/*
 * Onboarding persistence. (Spec Fase 5 / Req 6.3, 9.1)
 *
 * Non-secret wizard state survives a page refresh WITHIN the same session via sessionStorage,
 * with an expiry so a stale, abandoned flow doesn't resurrect hours later (and, in the real
 * backend, doesn't confirm a MSISDN the resource seam has long since released). sessionStorage
 * (not localStorage) scopes it to the tab/session, matching "resume within the same session".
 *
 * Reads are defensive: anything malformed, expired, or from a DIFFERENT tenant is ignored and the
 * wizard starts clean. The password/token are never part of OnboardingState, so there is nothing
 * secret to leak here.
 *
 * All functions are no-ops / null on the server (no window) so they are safe to call from a lazy
 * state initialiser.
 */

const STORAGE_KEY = "onboarding:v1";
/** How long a persisted flow stays resumable. Abandoned flows expire rather than mislead. */
const TTL_MS = 60 * 60 * 1000; // 60 minutes

interface Envelope {
  savedAt: number;
  state: OnboardingState;
}

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

/** Build the clean initial state for a tenant — the start of the wizard. */
export function initialOnboardingState(tenant: TenantId): OnboardingState {
  return {
    tenant,
    step: "welcome",
    selectedOfferId: null,
    reservedMsisdn: null,
    email: null,
    givenName: null,
    familyName: null,
    partyId: null,
    customerId: null,
    cartId: null,
  };
}

function isOnboardingStep(value: unknown): value is OnboardingStep {
  return typeof value === "string" && (ONBOARDING_STEPS as readonly string[]).includes(value);
}

/**
 * Validate a parsed envelope into a trusted OnboardingState for `tenant`, or null if it is
 * malformed, expired, or belongs to another tenant. Deliberately strict: a bad shape means start
 * clean, never crash.
 */
function reviveForTenant(raw: unknown, tenant: TenantId, now: number): OnboardingState | null {
  if (typeof raw !== "object" || raw === null) return null;
  const env = raw as Partial<Envelope>;
  if (typeof env.savedAt !== "number" || now - env.savedAt > TTL_MS) return null;

  const s = env.state;
  if (typeof s !== "object" || s === null) return null;
  const state = s as Partial<OnboardingState>;

  // Only resume if it's the same tenant — a different brand starts its own flow.
  if (!isTenantId(state.tenant) || state.tenant !== tenant) return null;
  if (!isOnboardingStep(state.step)) return null;

  // Rebuild field-by-field so unknown/missing fields get safe defaults and no extra keys leak in.
  const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
  return {
    tenant,
    step: state.step,
    selectedOfferId: str(state.selectedOfferId),
    reservedMsisdn: str(state.reservedMsisdn),
    email: str(state.email),
    givenName: str(state.givenName),
    familyName: str(state.familyName),
    partyId: str(state.partyId),
    customerId: str(state.customerId),
    cartId: str(state.cartId),
  };
}

/**
 * Load the persisted state for `tenant`, or a clean initial state when there is nothing valid to
 * resume. Safe on the server (returns the clean initial state).
 */
export function loadOnboardingState(tenant: TenantId): OnboardingState {
  if (!hasWindow()) return initialOnboardingState(tenant);
  try {
    const rawJson = window.sessionStorage.getItem(STORAGE_KEY);
    if (!rawJson) return initialOnboardingState(tenant);
    const revived = reviveForTenant(JSON.parse(rawJson), tenant, Date.now());
    return revived ?? initialOnboardingState(tenant);
  } catch {
    return initialOnboardingState(tenant);
  }
}

/** Persist the state with a fresh timestamp. No-op on the server. Never throws. */
export function saveOnboardingState(state: OnboardingState): void {
  if (!hasWindow()) return;
  try {
    const env: Envelope = { savedAt: Date.now(), state };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(env));
  } catch {
    // Storage full / disabled (private mode) — the wizard still works in-memory this session.
  }
}

/** Clear any persisted onboarding state. No-op on the server. Never throws. */
export function clearOnboardingState(): void {
  if (!hasWindow()) return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
