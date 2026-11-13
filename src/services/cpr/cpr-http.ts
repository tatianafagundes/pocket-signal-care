import { ok, err, seamError, type SeamError, type SeamResult } from "@/services/seam-result";
import type { Customer, Party, PartyInteraction } from "@/services/model";
import type {
  PartyInput,
  CustomerInput,
  CreateContractInput,
  CreateInteractionInput,
} from "@/schemas/cpr";
import type { TenantId } from "@/lib/tenant-rules";
import type { CprDriver } from "@/services/cpr/cpr-driver";

/*
 * CprClient (http) — the real-DXP CPR driver. (Spec cpr-http-onboarding, Task 4)
 *
 * Reaches the real Customer Profile Repository when VITE_CPR_DRIVER=http. It owns everything
 * protocol: base URL, auth token, the X-Tenant-ID header (the DXP tenant, resolved from the brand),
 * timeout, and the DXP REST mapping (party / customer / contract) — none of which leaks into the
 * seam or the UI. The seam calls the same CprDriver interface regardless of driver.
 *
 * Endpoints follow the customer's Postman collection + response-shapes.md:
 *   POST /customerManagement/v1/party     → { id }
 *   POST /customerManagement/v1/customer  → { id }   (engagedPartyId references the party)
 *   POST /customerManagement/v1/contract  → { id }   (keyed by communicationId = MSISDN)
 * create returns just the id; GET shapes are richer (see response-shapes.md).
 *
 * SCOPE (Task 4): party/customer/contract create + the error envelope. getCustomerAndParty
 * (customerview) is Task 5; createInteraction/listInteractions stay notConfigured (later spec).
 *
 * ⚠️ AUTH: VITE_CPR_TOKEN is bundled into client JS — acceptable ONLY against the local fake. A
 * real token must terminate server-side (BFF) before any non-localhost host; Task 7 adds a guard
 * that refuses a non-localhost base URL while the token is a client VITE var.
 */

interface CprHttpConfig {
  baseUrl: string;
  token: string;
  timeoutMs: number;
}

/** Injectable fetch — production uses the global; the contract test passes a recording shim. */
type FetchLike = typeof fetch;

function readConfig(): CprHttpConfig | null {
  const baseUrl = import.meta.env["VITE_CPR_BASE_URL"] as string | undefined;
  const token = import.meta.env["VITE_CPR_TOKEN"] as string | undefined;
  if (!baseUrl || !token) return null;
  return { baseUrl, token, timeoutMs: 10_000 };
}

/**
 * Resolve the app's brand slug (TenantId) to the DXP platform tenant id sent as X-Tenant-ID.
 * The brand (`drei`/`dreigo`) is NOT the DXP tenant (`TEN100000200008`). Read it from
 * VITE_CPR_TENANT_<BRAND>; fall back to the TEN_FAKE placeholder (the fake accepts any value).
 * The real brand→TEN map is a documented follow-up (D-tenant-placeholder).
 */
function resolveDxpTenant(brand: TenantId): string {
  const key = `VITE_CPR_TENANT_${brand.toUpperCase()}`;
  const value = import.meta.env[key] as string | undefined;
  return value && value !== "" ? value : "TEN_FAKE";
}

/** The DXP error envelope — every non-2xx CPR response carries this shape. */
interface DxpError {
  code?: number;
  reason?: string;
  message?: string;
}

/**
 * Map an HTTP status + the parsed DXP error envelope to a SeamError category. Follows the observed
 * codes in response-shapes.md: 4040 "Party is not active", 4041 "Duplicate…", 5031/5032 customer
 * inactivation blocked. Never throws — the caller wraps this in err().
 */
function mapHttpError(status: number, body: DxpError): SeamError {
  const code = body.code;
  const detail = body.message ?? body.reason;
  const seamCode = `cpr.http.${code ?? status}`;
  // 404 → the resource genuinely isn't there.
  if (status === 404) return seamError(seamCode, "notFound", "contactSupport", detail);
  // Duplicate / already-exists → a conflict the user can resolve by fixing input.
  if (status === 409 || code === 4041) return seamError(seamCode, "conflict", "fixInput", detail);
  // Business-rule rejections (wrong state transition) → rejected, fixable.
  if (code === 4040 || code === 5031 || code === 5032) {
    return seamError(seamCode, "rejected", "fixInput", detail);
  }
  // Any other 4xx is a rejected request; 5xx is a transient unavailability worth retrying.
  if (status >= 400 && status < 500) return seamError(seamCode, "rejected", "fixInput", detail);
  return seamError(seamCode, "unavailable", "retry", detail);
}

export function createCprHttp(injectedFetch?: FetchLike): CprDriver {
  const config = readConfig();
  const doFetch: FetchLike = injectedFetch ?? fetch;

  // Until the real endpoint is configured, fail loudly-but-safely with a SeamError (no throw).
  const notConfigured = <T>(): SeamResult<T> =>
    err(
      seamError(
        "cpr.http.notConfigured",
        "unavailable",
        "contactSupport",
        "CPR http driver selected but VITE_CPR_BASE_URL/TOKEN are not set.",
      ),
    );

  async function request<T>(
    brand: TenantId,
    path: string,
    init: RequestInit,
    mapResponse: (json: unknown) => T,
  ): Promise<SeamResult<T>> {
    if (!config) return notConfigured<T>();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const res = await doFetch(`${config.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.token}`,
          // The DXP tenant (resolved from the brand), pinned on every CPR call.
          "X-Tenant-ID": resolveDxpTenant(brand),
          ...(init.headers ?? {}),
        },
      });
      // 2xx is success (create returns 201; reads 200). res.ok covers the whole 2xx range.
      if (!res.ok) {
        // Try to parse the { code, reason, message } envelope; tolerate a non-JSON error body.
        let body: DxpError = {};
        try {
          body = (await res.json()) as DxpError;
        } catch {
          // keep the empty envelope — mapHttpError falls back to the status.
        }
        return err(mapHttpError(res.status, body));
      }
      const json: unknown = await res.json();
      try {
        return ok(mapResponse(json));
      } catch {
        // The response arrived but didn't match the expected shape (e.g. missing id). That's a
        // contract problem, not a network blip — surface it distinctly, not retryable.
        return err(seamError("cpr.http.badResponse", "unknown", "contactSupport"));
      }
    } catch {
      // Abort (timeout) or network error → retryable unavailable, never a thrown crash.
      return err(seamError("cpr.http.unavailable", "unavailable", "retry"));
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async resolveTenant(tenantId) {
      // TMF: GET an Organization/Party for the tenant. Mapping confined to fromTmf* below.
      return request(
        tenantId,
        `/customerManagement/v1/organization/${resolveDxpTenant(tenantId)}`,
        { method: "GET" },
        (json) => fromTmfTenant(json, tenantId),
      );
    },
    async createParty(input: PartyInput) {
      return request(
        input.tenantId,
        `/customerManagement/v1/party`,
        { method: "POST", body: JSON.stringify(toTmfParty(input)) },
        (json) => fromTmfPartyCreate(json),
      );
    },
    async createCustomer(input: CustomerInput) {
      return request(
        input.tenantId,
        `/customerManagement/v1/customer`,
        { method: "POST", body: JSON.stringify(toTmfCustomer(input)) },
        (json) => fromTmfCustomerCreate(json),
      );
    },
    async createContract(input: CreateContractInput) {
      return request(
        input.tenantId,
        `/customerManagement/v1/contract`,
        { method: "POST", body: JSON.stringify(toTmfContract(input)) },
        (json) => fromTmfContractCreate(json),
      );
    },
    async getCustomerAndParty(
      _customerId: string,
    ): Promise<SeamResult<{ customer: Customer; party: Party }>> {
      // GET /customerManagement/v1/customerview/{id}. Implemented in Task 5 (shape captured first).
      return notConfigured<{ customer: Customer; party: Party }>();
    },
    async createInteraction(_input: CreateInteractionInput): Promise<SeamResult<PartyInteraction>> {
      // Real TMF683 POST /partyInteraction — out of scope for this spec (later spec).
      return notConfigured<PartyInteraction>();
    },
    async listInteractions(_customerId: string): Promise<SeamResult<PartyInteraction[]>> {
      // Real TMF683 GET /partyInteraction — out of scope for this spec (later spec).
      return notConfigured<PartyInteraction[]>();
    },
  };
}

/* ---- DXP REST mapping (the ONLY place wire shapes live) ------------------------------- */

function toTmfParty(input: PartyInput): unknown {
  // Canonical -> DXP party (collection shape, trimmed to what onboarding provides). Email is an
  // EmailContact; an optional MSISDN is a PhoneContact. We omit the demographic fields the
  // collection carries (birthDate, nationality, …) — onboarding doesn't collect them.
  return {
    type: "Individual",
    partyNames: [{ givenName: input.givenName, familyName: input.familyName }],
    contactMedia: [
      {
        contactMediumType: "EmailContact",
        contactMediumValue: [{ value: input.email, purpose: "EmailContact" }],
      },
      ...(input.msisdn
        ? [
            {
              contactMediumType: "PhoneContact",
              contactMediumValue: [{ value: input.msisdn, purpose: "Telephone" }],
            },
          ]
        : []),
    ],
  };
}

function toTmfCustomer(input: CustomerInput): unknown {
  // Canonical -> DXP customer. engagedPartyId references the created party (collection shape).
  return {
    engagedPartyId: input.partyId,
    engagedPartyType: "Individual",
    statuses: [{ status: "CustomerCreated", reason: "CustomerCreated" }],
    customerType: "Residential",
  };
}

function toTmfContract(input: CreateContractInput): unknown {
  // Canonical -> DXP prepaid contract. Keyed by communicationId (the MSISDN). We send E.164 as-is
  // to the fake; if the real CPR needs a bare national number, normalize HERE (strip "+"/spaces) —
  // the domain keeps E.164 (D-communicationId-format debt).
  return {
    customerId: input.customerId,
    communicationId: input.communicationId,
    paymentContext: "PREPAID",
    statuses: [{ status: "ContractActive", validFor: { start: new Date().toISOString() } }],
  };
}

function fromTmfTenant(
  _json: unknown,
  tenantId: TenantId,
): { exists: boolean; id: TenantId; name: string } {
  // DXP Organization -> canonical TenantResolution. The real payload fills this later.
  return { exists: true, id: tenantId, name: tenantId };
}

function fromTmfPartyCreate(json: unknown): { partyId: string } {
  const id = (json as { id?: string } | null)?.id;
  // Never accept an empty id silently — a blank partyId would flow on as if valid. Throwing here
  // is caught by `request`'s inner try/catch and surfaces as cpr.http.badResponse.
  if (!id) throw new Error("CPR party create: missing id in response");
  return { partyId: id };
}

function fromTmfCustomerCreate(json: unknown): { customerId: string } {
  const id = (json as { id?: string } | null)?.id;
  if (!id) throw new Error("CPR customer create: missing id in response");
  return { customerId: id };
}

function fromTmfContractCreate(json: unknown): { contractId: string } {
  const id = (json as { id?: string } | null)?.id;
  if (!id) throw new Error("CPR contract create: missing id in response");
  return { contractId: id };
}
