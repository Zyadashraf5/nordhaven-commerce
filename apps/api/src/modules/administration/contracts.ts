/**
 * The Administration capability's published contract.
 *
 * The Administration capability is a **thin orchestration layer**: it reads the other capabilities
 * through their published contracts and presents one operational view. It owns no business state
 * and no table, and it has no bypass path into another capability's persistence.
 */

/** One counted state of a platform record. */
export interface OperationalCount {
  readonly state: string;
  readonly count: number;
}

/** The platform's operational picture at a moment in time. */
export interface OperationalOverview {
  readonly orders: readonly OperationalCount[];
  readonly shipments: readonly OperationalCount[];
  readonly returns: readonly OperationalCount[];
  readonly reviews: readonly OperationalCount[];
  readonly notifications: readonly OperationalCount[];
  readonly accounts: number;
  readonly collectedMinor: number;
  readonly refundedMinor: number;
  readonly pendingRefundMinor: number;
  readonly currency: string;
}

/** One customer, as the administrative surface reads them. */
export interface CustomerSummary {
  readonly customerId: string;
  readonly email: string | null;
  readonly role: string | null;
  readonly accountCreatedAt: Date | null;
  readonly orderCount: number;
  readonly reviewCount: number;
  readonly shipmentCount: number;
  readonly returnCount: number;
}

/** One customer with their commerce records. */
export interface CustomerDetail extends CustomerSummary {
  /** Counts are complete; each record-ID list is bounded independently. */
  readonly recordsTruncated: boolean;
  readonly orderIds: readonly string[];
  readonly reviewIds: readonly string[];
  readonly shipmentIds: readonly string[];
  readonly returnIds: readonly string[];
}

/**
 * The Administration capability's published contract.
 *
 * A later capability that must present an operational view asks through it, so the view has one
 * owner and one reader.
 */
export interface AdministrationView {
  overview(): Promise<OperationalOverview>;
  customers(limit: number): Promise<readonly CustomerSummary[]>;
  customer(customerId: string): Promise<CustomerDetail | null>;
}

/** The injection token the Administration capability publishes its view under. */
export const ADMINISTRATION_VIEW = Symbol('ADMINISTRATION_VIEW');
