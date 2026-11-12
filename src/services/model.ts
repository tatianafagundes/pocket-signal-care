import type { TenantId } from "@/lib/tenant-rules";

/*
 * Canonical domain model. (Spec Fase 3.1 / contracts/model)
 *
 * These are the shapes the screens consume — never raw TMF. The CPR http client maps
 * TMF632/629 to/from these; the mock driver builds them directly. Keeping one canonical
 * model means a screen is identical whether CPR is real or mocked.
 *
 * Money is minor units (euro cents) + currency, formatted by the active locale in the UI —
 * so there is never a float-rounding bug in balances or prices.
 */

/** A legal/individual party (TMF632 Party). */
export interface Party {
  partyId: string;
  tenantId: TenantId;
  givenName: string;
  familyName: string;
  email: string;
  /** E.164 where known; a prepaid party may not have an MSISDN until activation. */
  msisdn?: string;
}

export type CustomerStatus = "active" | "pending" | "suspended";

/** A customer (TMF629) — a party in a commercial relationship with the operator. */
export interface Customer {
  customerId: string;
  tenantId: TenantId;
  partyId: string;
  status: CustomerStatus;
  /** ISO date the customer was created. */
  createdAt: string;
}

/** A provisioned product on the customer's installed base (TMF637). */
export interface Product {
  productId: string;
  offerId: string;
  name: string;
  /** "plan" = the primary bought offer; "add-on" = an offer on top; "sim" = the SIM/MSISDN. */
  kind: "plan" | "add-on" | "sim";
  status: "active" | "pending";
}

/** Prepaid balance (TMF654). Minor units to avoid float errors. */
export interface Balance {
  /** Balance in minor units (euro cents). */
  amountMinor: number;
  currency: "EUR";
  /** ISO date the balance/plan validity expires, when applicable. */
  validUntil?: string;
}

/**
 * Customer360 — the composed view the Home/Account screens render. Assembled by the pure
 * `customer360-rules.compose(...)` from CPR (party/customer) + order (installed base) +
 * charging (balance). Composition is NOT done inside a connector.
 */
export interface Customer360 {
  customer: Customer;
  party: Party;
  installedBase: Product[];
  balance: Balance | null;
}

/** Result of resolving a tenant against CPR (Fase 2 TODO wired to this in Fase 3.4). */
export interface TenantResolution {
  exists: boolean;
  id: TenantId;
  name: string;
}

/*
 * Catalog (ECM / TMF620). An Offer is a catalogue item. Prepaid offers are modelled as
 * activation bundles (plan + recharge + SIM PO + MSISDN PO) per the DMP Value Accelerator —
 * the bundle detail lives in the catalog mock; the Offer here is the customer-facing summary.
 */
export interface Offer {
  offerId: string;
  tenantId: TenantId;
  name: string;
  /** Data allowance label, e.g. "10 GB" or "Unlimited". */
  dataAmount: string;
  /** Price in minor units (euro cents). */
  priceMinor: number;
  currency: "EUR";
  /** Validity in days (prepaid cycle). Optional: add-ons may have none. */
  validityDays?: number;
  /** The one recommended plan per tenant is highlighted in the grid. Read as `=== true`. */
  recommended?: boolean;
  /*
   * Enrichment fields (Fase 5 — Drei "up"-style catalogue). All optional, so existing offers
   * and tests are unaffected. These are a flattening of TMF620 ProductSpecCharacteristics — the
   * real catalog-http maps them from `characteristic`/`productOfferingPrice` (see
   * docs/contracts/tmf620-product-catalog.md). Mock values are a defensible placeholder, not
   * official Drei prices.
   */
  /** Auto-renews each cycle (prepaid "up" plans). */
  autoRenew?: boolean;
  /** Includes EU roaming. */
  euRoaming?: boolean;
  network?: "4G" | "5G";
  /** True for an unlimited-data plan (dataAmount is then a label like "Unlimited"). */
  unlimitedData?: boolean;
  /*
   * What kind of catalogue item this is. Absent = a normal plan.
   * NOTE: this is the CATALOGUE kind ("addon", no hyphen) and is a different domain from
   * `Product.kind` ("add-on", with a hyphen), which is the INSTALLED-BASE kind (TMF637).
   * An Offer is something you can buy; a Product is something already provisioned. The two
   * unions are deliberately distinct — do not unify them.
   */
  kind?: "plan" | "addon";
  /** Tier, used by the recommendation rule (not hardcoded offer ids). One plan per tier per tenant. */
  category?: "starter" | "standard" | "premium" | "unlimited" | "data-addon";
}

/*
 * Resource (DSIMA). A selectable/reservable mobile number and SIM validation result —
 * the first step of prepaid onboarding.
 */
export interface Msisdn {
  /** The number in E.164. */
  msisdn: string;
  tenantId: TenantId;
  /** Available until reserved; reserve removes it from the pool (concurrency). */
  status: "available" | "reserved";
}

export interface SimValidation {
  iccid: string;
  valid: boolean;
  /** SIM form when valid. */
  simType?: "physical" | "esim";
}

/*
 * Auth (Fase 5 / onboarding-journey Req 4). A new seam, isolated from CPR: the PASSWORD is an
 * authentication secret and never belongs on party/customer. The mock validates and creates a
 * fake session; the real driver (Keycloak OIDC, or Supabase) plugs in without changing the UI.
 */

/** An account = a credential (email) known to the auth seam. NEVER stores the password. */
export interface Account {
  email: string;
  /** ISO date the account was created. */
  createdAt: string;
}

/** Where a session came from — lets a real driver refuse a mock session. */
export type SessionOrigin = "mock" | "keycloak" | "supabase";

/** Result of a successful register/login. Token is fake in the mock; a JWT in the real IdP. */
export interface Session {
  token: string;
  email: string;
  tenantId: TenantId;
  /** Discriminant: a real driver MUST reject a session with origin "mock". */
  origin: SessionOrigin;
}

/**
 * Credentials travel UI → auth seam only. The password is validated then discarded — never
 * persisted, never logged, never sent to the CPR.
 */
export interface Credentials {
  tenantId: TenantId;
  email: string;
  password: string;
  givenName?: string | undefined;
  familyName?: string | undefined;
}

/** Per-criterion password result the UI renders as a checklist (icon + word). */
export interface PasswordStrength {
  minLength: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasNumber: boolean;
  /** True when every criterion is met. */
  ok: boolean;
}
