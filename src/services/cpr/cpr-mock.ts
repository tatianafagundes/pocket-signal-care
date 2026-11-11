import { ok, err, seamError, type SeamResult } from "@/services/seam-result";
import type { Balance, Customer, Party, Product } from "@/services/model";
import type { Customer360Parts } from "@/services/customer360-rules";
import type { PartyInput, CustomerInput } from "@/schemas/cpr";
import { tenantName, type TenantId } from "@/lib/tenant-rules";
import type { CprDriver } from "@/services/cpr/cpr-driver";

/*
 * CPR mock driver — in-memory store + per-tenant demo seed. (Spec Fase 3.3)
 *
 * The store is module-level so it survives across calls within a session (what the demo
 * needs: onboard a customer, then see them in the 360). It is NOT the database — the real CPR
 * (http driver) replaces this when VITE_CPR_DRIVER=http. Latency is simulated so loading states
 * are exercised; a per-op forced-error hook lands in Fase 4.5.
 *
 * Note: in the full architecture the installed base comes from the EOC mock and the balance
 * from the ECEV mock (Fase 4). Until those exist, the CPR mock seeds a minimal plan+SIM and a
 * starting balance on the demo customer so getCustomer360 returns a complete view end-to-end.
 * When Fase 4 lands, the seam will source installedBase/balance from those seams instead.
 */

interface MockRecord {
  party: Party;
  customer: Customer;
  installedBase: Product[];
  balance: Balance | null;
}

// customerId -> record. Module-level = survives across calls in the session.
const store = new Map<string, MockRecord>();
let seeded = false;

function simulateLatency(): Promise<void> {
  // 300–900ms, so skeleton/loading states are real in the demo.
  const ms = 300 + Math.floor(Math.random() * 600);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    const installedBase: Product[] = [
      {
        productId: `${customerId}-plan`,
        offerId: `${tenantId}-plan-10gb`,
        name: "Prepaid 10 GB",
        kind: "plan",
        status: "active",
      },
      {
        productId: `${customerId}-sim`,
        offerId: `${tenantId}-sim`,
        name: "SIM",
        kind: "sim",
        status: "active",
      },
    ];
    const balance: Balance = {
      amountMinor: 1500,
      currency: "EUR",
      validUntil: "2026-12-31T23:59:59Z",
    };
    store.set(customerId, { party, customer, installedBase, balance });
  }
}

export function createCprMock(): CprDriver {
  seed();
  return {
    async resolveTenant(tenantId) {
      await simulateLatency();
      // The known-tenant check is the local rule here; the real CPR confirms server-side (Fase 8).
      return ok({ exists: true, id: tenantId, name: tenantName(tenantId) });
    },

    async createParty(input: PartyInput): Promise<SeamResult<{ partyId: string }>> {
      await simulateLatency();
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
    },

    async createCustomer(input: CustomerInput): Promise<SeamResult<{ customerId: string }>> {
      await simulateLatency();
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
      // New prepaid customer: empty installed base + no balance yet (provisioned later).
      store.set(customerId, { party, customer, installedBase: [], balance: null });
      pendingParties.delete(input.partyId);
      return ok({ customerId });
    },

    async getCustomer360Parts(customerId: string): Promise<SeamResult<Customer360Parts>> {
      await simulateLatency();
      const rec = store.get(customerId);
      if (!rec) {
        return err(seamError("cpr.customer.notFound", "notFound", "contactSupport"));
      }
      return ok({
        customer: rec.customer,
        party: rec.party,
        installedBase: rec.installedBase,
        balance: rec.balance,
      });
    },
  };
}

// Parties created but not yet attached to a customer (onboarding is two steps).
const pendingParties = new Map<string, Party>();

function cryptoId(): string {
  // Short random id; crypto.randomUUID exists in the browser + modern node/bun.
  return crypto.randomUUID().slice(0, 8);
}
