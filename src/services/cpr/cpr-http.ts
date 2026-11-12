import { ok, err, seamError, type SeamResult } from "@/services/seam-result";
import type { Customer, Party } from "@/services/model";
import type { PartyInput, CustomerInput } from "@/schemas/cpr";
import type { TenantId } from "@/lib/tenant-rules";
import type { CprDriver } from "@/services/cpr/cpr-driver";

/*
 * CprClient (http) — the real-CPR driver STUB. (Spec Fase 3.3 / 8.1)
 *
 * This is where the real Customer/Party Repository is reached when VITE_CPR_DRIVER=http. It
 * owns everything protocol: base URL, auth token, the X-Tenant-Id header, timeout, and the
 * TMF632 (Party) / TMF629 (Customer) mapping — none of which leaks into the seam or the UI.
 * The seam calls the same CprDriver interface regardless.
 *
 * It is a stub: the fetch calls + TMF mappers are scaffolded but the endpoints are not live, so
 * every op returns a clear "not configured" SeamError until Fase 8 wires the real base URL.
 * The mapping functions (toTmfParty / fromTmfCustomer / …) are the single place TMF shapes live.
 *
 * ⚠️ FASE 8 — EDIT HERE to go live (see src/services/README.md + docs/contracts/dxp-customer-management-cpr.md):
 *   1. The paths below use generic /tmf-api/party/v5/... — the REAL DXP CPR endpoints are
 *      /customerManagement/v1/party, /customer, and /customerview/{id}. Reconcile before use.
 *   2. Complete getCustomerAndParty (currently notConfigured) → GET /customerManagement/v1/customerview/{id}.
 *   3. Keep TMF mapping in the toTmf / fromTmf mapper functions only. Everything else
 *      (seam, api, UI) stays untouched.
 */

interface CprHttpConfig {
  baseUrl: string;
  token: string;
  timeoutMs: number;
}

function readConfig(): CprHttpConfig | null {
  const baseUrl = import.meta.env.VITE_CPR_BASE_URL as string | undefined;
  const token = import.meta.env.VITE_CPR_TOKEN as string | undefined;
  if (!baseUrl || !token) return null;
  return { baseUrl, token, timeoutMs: 10_000 };
}

export function createCprHttp(): CprDriver {
  const config = readConfig();

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
    tenantId: TenantId,
    path: string,
    init: RequestInit,
    mapResponse: (json: unknown) => T,
  ): Promise<SeamResult<T>> {
    if (!config) return notConfigured<T>();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const res = await fetch(`${config.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.token}`,
          "X-Tenant-Id": tenantId, // tenant pinned on every CPR call
          ...(init.headers ?? {}),
        },
      });
      if (!res.ok) {
        const category = res.status === 404 ? "notFound" : "unavailable";
        return err(seamError(`cpr.http.${res.status}`, category, "retry"));
      }
      const json: unknown = await res.json();
      try {
        return ok(mapResponse(json));
      } catch {
        // The response arrived but didn't match the expected TMF shape (e.g. missing id).
        // That's a contract problem, not a network blip — surface it distinctly, not retryable.
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
        `/tmf-api/party/v5/organization/${tenantId}`,
        { method: "GET" },
        (json) => fromTmfTenant(json, tenantId),
      );
    },
    async createParty(input: PartyInput) {
      return request(
        input.tenantId,
        `/tmf-api/party/v5/individual`,
        { method: "POST", body: JSON.stringify(toTmfParty(input)) },
        (json) => fromTmfPartyCreate(json),
      );
    },
    async createCustomer(input: CustomerInput) {
      return request(
        input.tenantId,
        `/tmf-api/customer/v5/customer`,
        { method: "POST", body: JSON.stringify(toTmfCustomer(input)) },
        (json) => fromTmfCustomerCreate(json),
      );
    },
    async getCustomerAndParty(
      _customerId: string,
    ): Promise<SeamResult<{ customer: Customer; party: Party }>> {
      // Real CPR GET customer + its engaged party (TMF629/632). Stubbed until Fase 8 wires it.
      return notConfigured<{ customer: Customer; party: Party }>();
    },
  };
}

/* ---- TMF mapping (the ONLY place TMF shapes live) ------------------------------------- */

function toTmfParty(input: PartyInput): unknown {
  // Canonical -> TMF632 Individual.
  return {
    givenName: input.givenName,
    familyName: input.familyName,
    contactMedium: [
      { mediumType: "email", characteristic: { emailAddress: input.email } },
      ...(input.msisdn
        ? [{ mediumType: "phone", characteristic: { phoneNumber: input.msisdn } }]
        : []),
    ],
  };
}

function toTmfCustomer(input: CustomerInput): unknown {
  // Canonical -> TMF629 Customer (engagedParty references the created party).
  return { engagedParty: { id: input.partyId, "@referredType": "Individual" } };
}

function fromTmfTenant(
  _json: unknown,
  tenantId: TenantId,
): { exists: boolean; id: TenantId; name: string } {
  // TMF Organization -> canonical TenantResolution. Fase 8 fills from the real payload.
  return { exists: true, id: tenantId, name: tenantId };
}

function fromTmfPartyCreate(json: unknown): { partyId: string } {
  const id = (json as { id?: string } | null)?.id;
  // Never accept an empty id silently — a blank partyId would flow on as if valid. Throwing
  // here is caught by `request`'s try/catch and surfaces as a retryable seam.unavailable.
  if (!id) throw new Error("CPR party create: missing id in TMF632 response");
  return { partyId: id };
}

function fromTmfCustomerCreate(json: unknown): { customerId: string } {
  const id = (json as { id?: string } | null)?.id;
  if (!id) throw new Error("CPR customer create: missing id in TMF629 response");
  return { customerId: id };
}
