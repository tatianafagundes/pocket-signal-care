import { ok, err, seamError, type SeamResult } from "@/services/seam-result";
import type { Contract, Customer, Party, PartyInteraction } from "@/services/model";
import type {
  PartyInput,
  CustomerInput,
  CreateContractInput,
  CreateInteractionInput,
} from "@/schemas/cpr";
import { tenantName, type TenantId } from "@/lib/tenant-rules";
import type { CprDriver } from "@/services/cpr/cpr-driver";
import { withMock } from "@/services/mock-support";
import {
  DEMO_VARIANTS,
  DEMO_VARIANT_SPECS,
  demoCustomerId,
  type DemoVariant,
} from "@/services/demo-variants";

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
// customerId -> prepaid contract. Survives the session like the store.
const contracts = new Map<string, Contract>();
let seeded = false;

/**
 * Seed the demo customers per tenant, once. CPR owns party + customer, so per variant it only
 * varies `customer.status` (from the variant spec); the plan/balance/usage deltas are applied by
 * the order and charging mocks from the same spec. Ids are stable so the demo can deep-link.
 */
function seed(): void {
  if (seeded) return;
  seeded = true;
  const tenants: TenantId[] = ["drei", "dreigo"];
  for (const tenantId of tenants) {
    for (const variant of DEMO_VARIANTS) {
      seedVariant(tenantId, variant);
    }
  }
}

function seedVariant(tenantId: TenantId, variant: DemoVariant): void {
  const customerId = demoCustomerId(tenantId, variant);
  const partyId = `demo-party-${tenantId}${variant === "healthy" ? "" : `-${variant}`}`;
  const spec = DEMO_VARIANT_SPECS[variant];
  const party: Party = {
    partyId,
    tenantId,
    givenName: "Alex",
    familyName: "Demo",
    email: `alex.${variant}@${tenantId}.example`,
    msisdn: msisdnFor(tenantId, variant),
  };
  const customer: Customer = {
    customerId,
    tenantId,
    partyId,
    status: spec.customerStatus,
    createdAt: "2026-01-15T10:00:00Z",
  };
  store.set(customerId, { party, customer });
  // The demo customer onboarded once — seed the matching Party Interaction so the 360 timeline
  // has the same history a freshly onboarded customer gets (a completed onboarding interaction).
  interactions.set(customerId, [
    {
      interactionId: `pi-seed-${tenantId}-${variant}`,
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

/** Distinct demo numbers per tenant+variant so each line reads as its own. */
function msisdnFor(tenantId: TenantId, variant: DemoVariant): string {
  const base = tenantId === "drei" ? 4368120000001 : 4368120000002;
  const offset = DEMO_VARIANTS.indexOf(variant) * 10;
  return `+${base + offset}`;
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

    createContract(input: CreateContractInput): Promise<SeamResult<{ contractId: string }>> {
      return withMock("cpr.createContract", () => {
        // A contract needs an existing customer (mirrors createCustomer-requires-party).
        if (!store.has(input.customerId)) {
          return err(
            seamError(
              "cpr.customer.notFound",
              "notFound",
              "fixInput",
              "Create the customer first.",
            ),
          );
        }
        const contractId = `contract-${cryptoId()}`;
        contracts.set(input.customerId, {
          contractId,
          customerId: input.customerId,
          communicationId: input.communicationId,
          paymentContext: "PREPAID",
          status: "active",
        });
        return ok({ contractId });
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
