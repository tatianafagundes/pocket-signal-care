import { ok, err, seamError, type SeamResult } from "@/services/seam-result";
import type { Customer360Parts } from "@/services/customer360-rules";
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
      return ok(mapResponse(await res.json()));
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
    async getCustomer360Parts(_customerId: string): Promise<SeamResult<Customer360Parts>> {
      // The 360 fan-out (customer + installed base + balance) is assembled server-side in Fase 8;
      // the seam still composes the canonical shape with the pure rule. Stubbed until wired.
      return notConfigured<Customer360Parts>();
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
  const id = (json as { id?: string } | null)?.id ?? "";
  return { partyId: id };
}

function fromTmfCustomerCreate(json: unknown): { customerId: string } {
  const id = (json as { id?: string } | null)?.id ?? "";
  return { customerId: id };
}
