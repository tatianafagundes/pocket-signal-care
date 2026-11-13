import { ok, err, seamError, type SeamResult } from "@/services/seam-result";
import type { Customer, Party, PartyInteraction } from "@/services/model";
import type { PartyInput, CustomerInput, CreateInteractionInput } from "@/schemas/cpr";
import { tenantName, type TenantId } from "@/lib/tenant-rules";
import type { CprDriver } from "@/services/cpr/cpr-driver";
import { withMock } from "@/services/mock-support";

/*
 * CPR mock driver — in-memory party + customer store, per-tenant demo seed. (Spec Fase 3.3)
 *
 * CPR owns ONLY party + customer. The demo customer's installed base lives in the order (EOC)
 * mock and its balance in the charging (ECEV) mock — the seam's getCustomer360 fans out to
 * those. The store is module-level so it survives the session (onboard a customer, then see it
 * in the 360). It is NOT the database — the http driver replaces it when VITE_CPR_DRIVER=http.
 * Latency + forced-error come from withMock.
 */

interface MockRecord {
  party: Party;
  customer: Customer;
}

// customerId -> record. Module-level = survives across calls in the session.
const store = new Map<string, MockRecord>();
// customerId -> party interactions (TMF683), newest first. Survives the session like the store.
const interactions = new Map<string, PartyInteraction[]>();
let seeded = false;

/** Seed one demo customer per tenant, once. Ids are stable so the demo can deep-link. */
function seed(): void {
  if (seeded) return;
  seeded = true;
  const tenants: TenantId[] = ["drei", "dreigo"];
  for (const tenantId of tenants) {
    const partyId = `demo-party-${tenantId}`;
    const customerId = `demo-${tenantId}`;
    const party: Party = {
      partyId,
      tenantId,
      givenName: "Alex",
      familyName: "Demo",
      email: `alex.demo@${tenantId}.example`,
      msisdn: tenantId === "drei" ? "+4368120000001" : "+4368120000002",
    };
    const customer: Customer = {
      customerId,
      tenantId,
      partyId,
      status: "active",
      createdAt: "2026-01-15T10:00:00Z",
    };
    store.set(customerId, { party, customer });
    // A second demo line per tenant in the suspended state, so the 360 can show it.
    const suspendedId = `${customerId}-suspended`;
    store.set(suspendedId, {
      party: {
        ...party,
        partyId: `${partyId}-suspended`,
        email: `alex.suspended@${tenantId}.example`,
        msisdn: tenantId === "drei" ? "+4368120000009" : "+4368120000008",
      },
      customer: {
        ...customer,
        customerId: suspendedId,
        partyId: `${partyId}-suspended`,
        status: "suspended",
      },
    });
    // The demo customer onboarded once — seed the matching Party Interaction so the 360 timeline
    // has the same history a freshly onboarded customer gets (a completed onboarding interaction).
    interactions.set(customerId, [
      {
        interactionId: `pi-seed-${tenantId}`,
        partyId,
        customerId,
        tenantId,
        type: "onboarding",
        status: "completed",
        occurredAt: "2026-01-15T10:00:00Z",
        relatedEntities: { msisdn: party.msisdn },
      },
    ]);
  }
}

export function createCprMock(): CprDriver {
  seed();
  return {
    resolveTenant(tenantId) {
      // The known-tenant check is the local rule here; the real CPR confirms server-side (Fase 8).
      return withMock("cpr.resolveTenant", () =>
        ok({ exists: true, id: tenantId, name: tenantName(tenantId) }),
      );
    },

    createParty(input: PartyInput): Promise<SeamResult<{ partyId: string }>> {
      return withMock("cpr.createParty", () => {
        const partyId = `party-${cryptoId()}`;
        // Hold the party on a provisional record keyed by partyId until a customer is created.
        pendingParties.set(partyId, {
          partyId,
          tenantId: input.tenantId,
          givenName: input.givenName,
          familyName: input.familyName,
          email: input.email,
          ...(input.msisdn ? { msisdn: input.msisdn } : {}),
        });
        return ok({ partyId });
      });
    },

    createCustomer(input: CustomerInput): Promise<SeamResult<{ customerId: string }>> {
      return withMock("cpr.createCustomer", () => {
        const party = pendingParties.get(input.partyId);
        if (!party) {
          return err(
            seamError("cpr.party.notFound", "notFound", "fixInput", "Create the party first."),
          );
        }
        const customerId = `cust-${cryptoId()}`;
        const customer: Customer = {
          customerId,
          tenantId: input.tenantId,
          partyId: input.partyId,
          status: "active",
          createdAt: new Date().toISOString(),
        };
        store.set(customerId, { party, customer });
        pendingParties.delete(input.partyId);
        return ok({ customerId });
      });
    },

    getCustomerAndParty(
      customerId: string,
    ): Promise<SeamResult<{ customer: Customer; party: Party }>> {
      return withMock("cpr.getCustomerAndParty", () => {
        const rec = store.get(customerId);
        if (!rec) {
          return err(seamError("cpr.customer.notFound", "notFound", "contactSupport"));
        }
        return ok({ customer: rec.customer, party: rec.party });
      });
    },

    createInteraction(input: CreateInteractionInput): Promise<SeamResult<PartyInteraction>> {
      return withMock("cpr.createInteraction", () => {
        const interaction: PartyInteraction = {
          interactionId: `pi-${cryptoId()}`,
          partyId: input.partyId,
          customerId: input.customerId,
          tenantId: input.tenantId,
          type: input.type,
          status: input.status,
          occurredAt: new Date().toISOString(),
          ...(input.relatedEntities ? { relatedEntities: input.relatedEntities } : {}),
          ...(input.reasonKey ? { reasonKey: input.reasonKey } : {}),
        };
        // Newest first. Build a NEW array (don't mutate the stored/seeded one in place) so a
        // future caller that holds a reference from .get() can't observe later writes.
        const list = [interaction, ...(interactions.get(input.customerId) ?? [])];
        interactions.set(input.customerId, list);
        return ok({ ...interaction });
      });
    },

    listInteractions(customerId: string): Promise<SeamResult<PartyInteraction[]>> {
      return withMock("cpr.listInteractions", () =>
        ok((interactions.get(customerId) ?? []).map((i) => ({ ...i }))),
      );
    },
  };
}

// Parties created but not yet attached to a customer (onboarding is two steps).
const pendingParties = new Map<string, Party>();

function cryptoId(): string {
  // Short random id; crypto.randomUUID exists in the browser + modern node/bun.
  return crypto.randomUUID().slice(0, 8);
}
