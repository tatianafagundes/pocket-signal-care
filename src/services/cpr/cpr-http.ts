import { ok, err, seamError, type SeamError, type SeamResult } from "@/services/seam-result";
import type { Customer, Party, PartyInteraction } from "@/services/model";
import type {
  PartyInput,
  CustomerInput,
  CreateContractInput,
  CreateInteractionInput,
} from "@/schemas/cpr";
import { DEFAULT_TENANT, isTenantId, type TenantId } from "@/lib/tenant-rules";
import type { CustomerStatus } from "@/services/model";
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
 * TOKEN IS OFF THE CLIENT (cpr-bff-auth Task 2): the driver calls the same-origin BFF
 * (`/bff/cpr/*`), which holds the CPR token + resolves the DXP tenant server-side. This driver
 * carries NO token and NO Authorization header. It passes the app brand as a non-secret
 * `X-App-Brand` header; the BFF turns that into `X-Tenant-ID`.
 */

interface CprHttpConfig {
  /** The same-origin BFF prefix the driver posts to (default `/bff/cpr`). No token here. */
  baseUrl: string;
  timeoutMs: number;
}

/** Injectable fetch — production uses the global; the contract test passes a recording shim. */
type FetchLike = typeof fetch;

/** The same-origin BFF prefix. FIXED, not configurable: the client must never choose the host —
 *  it only ever talks to the BFF, which owns the real CPR URL + token server-side (K1). */
const BFF_PREFIX = "/bff/cpr";

/**
 * Config for the http driver. The driver is active only when VITE_CPR_DRIVER=http (chosen in
 * cpr.functions.ts). The base URL is ALWAYS the same-origin BFF prefix — there is no env override,
 * so a build can never point the browser at an arbitrary CPR host (that would bypass the BFF). No
 * client token, ever.
 */
function readConfig(): CprHttpConfig {
  return { baseUrl: BFF_PREFIX, timeoutMs: 10_000 };
}

/**
 * The brand this app build acts as, for reads whose interface carries no tenant
 * (getCustomerAndParty). One app build = one brand, so VITE_CPR_ACTIVE_BRAND (validated) names it;
 * default to DEFAULT_TENANT. A true multi-brand CPR read would thread the tenant through the
 * driver signature — recorded as D-360-tenant-on-http.
 */
function activeBrand(): TenantId {
  const raw = import.meta.env["VITE_CPR_ACTIVE_BRAND"] as string | undefined;
  return isTenantId(raw) ? raw : DEFAULT_TENANT;
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

  // For ops still out of scope on http (tenant lookup, interactions): a clear, non-throwing error.
  const notConfigured = <T>(): SeamResult<T> =>
    err(
      seamError(
        "cpr.http.notConfigured",
        "unavailable",
        "contactSupport",
        "This CPR operation is not wired on the http driver yet (out of scope).",
      ),
    );

  async function request<T>(
    brand: TenantId,
    path: string,
    init: RequestInit,
    mapResponse: (json: unknown) => T,
  ): Promise<SeamResult<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const res = await doFetch(`${config.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          // NO Authorization here — the BFF injects the token server-side. The app brand travels
          // as a non-secret header; the BFF resolves it to the DXP X-Tenant-ID.
          "X-App-Brand": brand,
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
    async resolveTenant(_tenantId) {
      // notConfigured: the collection + response-shapes.md carry NO tenant-lookup endpoint, so the
      // real path is unknown and inventing one (e.g. /organization/{id}) would be a guessed API.
      // tenant-provider's resolveTenant confirm treats a SeamFailure as a backend blip (keeps the
      // brand, no not-found banner), so this degrades gracefully. Real tenant resolution is a
      // later spec; the brand→DXP map is already a documented debt.
      return notConfigured<{ exists: boolean; id: TenantId; name: string }>();
    },
    async createParty(input: PartyInput) {
      return request(
        input.tenantId,
        `/party`,
        { method: "POST", body: JSON.stringify(toTmfParty(input)) },
        (json) => fromTmfPartyCreate(json),
      );
    },
    async createCustomer(input: CustomerInput) {
      return request(
        input.tenantId,
        `/customer`,
        { method: "POST", body: JSON.stringify(toTmfCustomer(input)) },
        (json) => fromTmfCustomerCreate(json),
      );
    },
    async createContract(input: CreateContractInput) {
      return request(
        input.tenantId,
        `/contract`,
        { method: "POST", body: JSON.stringify(toTmfContract(input)) },
        (json) => fromTmfContractCreate(json),
      );
    },
    async getCustomerAndParty(customerId: string) {
      // GET the composite customerview (customer + engaged party in one call). The prepaid shape
      // was captured from the fake into response-shapes.md (Task 5.1); the mapper reads only what
      // the domain needs.
      //
      // TENANT: the CprDriver.getCustomerAndParty(customerId) signature carries NO tenant, and the
      // customerview body carries none either (it's pinned by X-Tenant-ID). So on http we resolve
      // the header + stamp customer.tenantId from the configured single-brand context
      // (VITE_CPR_ACTIVE_BRAND, default "drei"). This is correct for a single-brand deployment
      // (one app build = one brand) and is the honest limit of this interface: a true multi-brand
      // CPR read would need the tenant threaded through the signature — recorded as a debt
      // (D-360-tenant-on-http). getCustomer360's cross-tenant check still holds: it compares this
      // stamped tenant to expectedTenant.
      const brand = activeBrand();
      return request(brand, `/customerview/${customerId}`, { method: "GET" }, (json) =>
        fromTmfCustomerView(json, brand),
      );
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

/* ---- customerview types (only the fields the mapper reads) ---- */
interface TmfStatus {
  status?: string;
}
interface TmfContactMedium {
  contactMediumType?: string;
  contactMediumValue?: { value?: string; purpose?: string }[];
}
interface TmfPartyView {
  id?: string;
  partyNames?: { givenName?: string; familyName?: string }[];
  contactMedia?: TmfContactMedium[];
}
interface TmfCustomerView {
  id?: string;
  statuses?: TmfStatus[];
  engagedParty?: TmfPartyView;
}

/** Collapse the DXP customer `statuses[]` to the domain CustomerStatus. */
function customerStatusFrom(statuses: TmfStatus[] | undefined): CustomerStatus {
  const latest = statuses?.[statuses.length - 1]?.status;
  if (latest === "CustomerActive") return "active";
  if (latest === "CustomerSuspended") return "suspended";
  // CustomerCreated and anything unknown are "pending" — a created-but-not-active prepaid line.
  return "pending";
}

/** Read the first contactMedium of a given type (e.g. EmailContact) → its value. */
function contactValue(media: TmfContactMedium[] | undefined, type: string): string | undefined {
  const medium = media?.find((m) => m.contactMediumType === type);
  return medium?.contactMediumValue?.[0]?.value;
}

/**
 * DXP customerview -> domain { customer, party }. Throws (→ cpr.http.badResponse) if the ids or the
 * email are missing, since the 360 cannot render a customer without them. `tenantId` is stamped
 * from the active brand (the view carries none; see getCustomerAndParty).
 */
function fromTmfCustomerView(json: unknown, brand: TenantId): { customer: Customer; party: Party } {
  const view = (json ?? {}) as TmfCustomerView;
  const customerId = view.id;
  const party = view.engagedParty;
  const partyId = party?.id;
  if (!customerId || !partyId) {
    throw new Error("CPR customerview: missing customer id or engaged party id");
  }
  const name = party?.partyNames?.[0];
  const email = contactValue(party?.contactMedia, "EmailContact");
  if (!email) throw new Error("CPR customerview: missing email contact medium");
  const msisdn = contactValue(party?.contactMedia, "PhoneContact");
  return {
    customer: {
      customerId,
      tenantId: brand,
      partyId,
      status: customerStatusFrom(view.statuses),
      // The view has no explicit createdAt; the domain requires one. Use "now" as a safe default —
      // the 360 shows the customer, not this timestamp, and the real GET customer carries the
      // status validFor if a precise date is ever needed.
      createdAt: new Date().toISOString(),
    },
    party: {
      partyId,
      tenantId: brand,
      givenName: name?.givenName ?? "",
      familyName: name?.familyName ?? "",
      email,
      ...(msisdn ? { msisdn } : {}),
    },
  };
}
