import type { SeamResult } from "@/services/seam-result";
import type { ActivityItem, Balance, UsageBucket, UsageUnit } from "@/services/model";

/**
 * A grant/refill of a non-monetary allowance (TMF654). The ECEV op that an add-on fulfilment
 * triggers: top up (or create) a bucket of `type` for `amount`/`unit`, correlated to the offer that
 * granted it. In real DMP, order fulfilment makes CBEV create/refill the product bucket; here the
 * add-on purchase flow calls grantAllowance after submitOrder (the two seams stay decoupled).
 */
export interface AllowanceGrant {
  type: UsageBucket["type"];
  /** Offer that granted it — the refill key and the C360 correlation (DMP productOfferingId). */
  offerId: string;
  offerName?: string | undefined;
  /** Granted quantity + unit. Both omitted for an unlimited grant (unlimited: true below). */
  amount?: number | undefined;
  unit?: UsageUnit | undefined;
  /** True for an unlimited grant (an unlimited add-on); amount/unit are then ignored. */
  unlimited?: boolean | undefined;
  /** Validity range for the granted bucket (TMF654 validFor). */
  validFor?: { start?: string | undefined; end?: string | undefined } | undefined;
}

/*
 * ChargingDriver (ECEV) — the interface the mock and http client implement. (Spec Fase 4.4)
 * Prepaid balance: read, top up, and deduct for an order. Plus the USAGE axis (TMF654 product
 * buckets): read buckets and grant/refill one on add-on fulfilment. driverFor('ecev') picks the
 * impl. Amounts are minor units (euro cents). Never throws → SeamResult.
 */
export interface ChargingDriver {
  getBalance(customerId: string): Promise<SeamResult<Balance | null>>;
  topUp(customerId: string, amountMinor: number): Promise<SeamResult<Balance>>;
  /** Deduct a charge from a customer's balance (Fase 6 buy flow). Refuses to go negative. */
  rateAndDeduct(customerId: string, amountMinor: number): Promise<SeamResult<{ ok: true }>>;
  /** Read the customer's non-monetary allowance buckets (TMF654). Empty when none. */
  getUsage(customerId: string): Promise<SeamResult<UsageBucket[]>>;
  /**
   * Grant or refill an allowance bucket (add-on fulfilment). If a bucket with the same offerId
   * exists it is refilled (total + remaining both increase); otherwise a new bucket is created.
   */
  grantAllowance(customerId: string, grant: AllowanceGrant): Promise<SeamResult<UsageBucket>>;
  /**
   * Read the customer's financial activity — top-ups, refills, adjustments, newest first. Real DMP:
   * a union of TMF654 Prepay Balance Management (top-ups/refills) and Financial Transaction Enquiry
   * (payments/refunds/adjustments). Empty when none. The money-axis "recent activity" feed.
   */
  getActivity(customerId: string): Promise<SeamResult<ActivityItem[]>>;
}
