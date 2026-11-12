import {
  ONBOARDING_STEPS,
  type OnboardingState,
  type OnboardingStep,
} from "@/lib/onboarding-context";
import { isTenantId, type TenantId } from "@/lib/tenant-rules";
import type { DeliveryAddress, SimChoice } from "@/services/model";

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
    selectedAddOnIds: [],
    simType: null,
    reservedMsisdn: null,
    email: null,
    givenName: null,
    familyName: null,
    deliveryAddress: null,
    partyId: null,
    customerId: null,
    cartId: null,
    addressId: null,
    esimProfileId: null,
    authorizationRef: null,
    orderId: null,
    captured: false,
    credited: false,
    interactionId: null,
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
  const strArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  const simType = (v: unknown): SimChoice | null => (v === "physical" || v === "esim" ? v : null);
  // A money-milestone flag resumes as "done" ONLY if it was literally `true`; anything else
  // (missing, malformed) is `false`, so the worst case is a redundant idempotent retry, never a
  // skipped capture/credit.
  const bool = (v: unknown): boolean => v === true;
  return {
    tenant,
    step: state.step,
    selectedOfferId: str(state.selectedOfferId),
    selectedAddOnIds: strArray(state.selectedAddOnIds),
    simType: simType(state.simType),
    reservedMsisdn: str(state.reservedMsisdn),
    email: str(state.email),
    givenName: str(state.givenName),
    familyName: str(state.familyName),
    deliveryAddress: reviveDeliveryAddress(state.deliveryAddress),
    partyId: str(state.partyId),
    customerId: str(state.customerId),
    cartId: str(state.cartId),
    addressId: str(state.addressId),
    esimProfileId: str(state.esimProfileId),
    authorizationRef: str(state.authorizationRef),
    orderId: str(state.orderId),
    captured: bool(state.captured),
    credited: bool(state.credited),
    interactionId: str(state.interactionId),
  };
}

/**
 * Revive a delivery address: all required string fields present, or null. Strict — a malformed
 * address resumes as "not entered" rather than a half-filled object the form would trust.
 */
function reviveDeliveryAddress(v: unknown): DeliveryAddress | null {
  if (typeof v !== "object" || v === null) return null;
  const a = v as Record<string, unknown>;
  const req = (k: string): string | null => (typeof a[k] === "string" ? (a[k] as string) : null);
  const line1 = req("line1");
  const city = req("city");
  const region = req("region");
  const postalCode = req("postalCode");
  const country = req("country");
  if (!line1 || !city || !region || !postalCode || !country) return null;
  const line2 = typeof a["line2"] === "string" ? a["line2"] : undefined;
  return { line1, line2, city, region, postalCode, country };
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
