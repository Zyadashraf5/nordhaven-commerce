# API Contract: Milestone 10 - Payments and Refunds (Implemented)

**Date**: 2026-10-21

**Status**: **Implemented and verified.** Every route below is served by the running application and
is asserted against the committed OpenAPI document by the end-to-end suite.

**Version**: the published contract is `1.0.0`.

## The customer payment routes

Every route below requires the `CUSTOMER` role. An anonymous caller receives
`401 UNAUTHENTICATED`; an administrator receives `403 FORBIDDEN`.

### `POST /api/v1/payments/attempts`

Starts a payment attempt for an order.

**Headers.**

```
Idempotency-Key: <a stable business key, at least eight characters>
```

The key is **scoped to the customer**. A repeated or a concurrent request returns the attempt the
first one created, so a dropped connection never creates two charges.

**Request.**

```json
{ "orderId": "8f2c..." }
```

The schema is **strict**, so an unexpected field is refused with `400 VALIDATION_ERROR`. In
particular there is **no amount field**, so a client cannot ask for a different amount to be
charged: the amount is the order's total, read through the Orders capability's contract.

**Response `201`.**

```json
{
  "id": "3a1b...",
  "orderId": "8f2c...",
  "status": "PENDING",
  "amountMinor": 148086,
  "currency": "EGP",
  "provider": "LOCAL_TEST",
  "providerReference": "local-test-payment-3a1b...",
  "refundedMinor": 0,
  "statusReason": null,
  "createdAt": "2026-10-21T10:20:00.000Z",
  "succeededAt": null,
  "failedAt": null
}
```

**Errors.**

| Code                  | Status | Meaning                                                          |
| --------------------- | ------ | ---------------------------------------------------------------- |
| `VALIDATION_ERROR`    | 400    | A malformed body, or a missing or short `Idempotency-Key`.       |
| `ORDER_NOT_FOUND`     | 404    | No such order, or it belongs to another customer.                 |
| `PAYMENT_NOT_PAYABLE` | 409    | The order is not awaiting payment.                                |

### `GET /api/v1/payments`

Lists the customer's payment attempts, newest first. Every attempt reports its own amount and its
own state, and no attempt reports any card number, token, or other payment material, because the
platform stores none.

### `GET /api/v1/payments/attempts/{paymentAttemptId}/refunds`

Lists the refunds of one payment attempt that belong to the customer.

## The provider event intake

### `POST /api/v1/payments/webhooks/{provider}`

Delivers a provider payment event.

**Authorization.** The route is **public**, because a provider is not an authenticated customer, and
it is exactly that which makes the verification load-bearing. A provider the platform has no
adapter for is refused.

**Headers.** The signature header, the provider's event identifier, the event type, the order, the
provider's payment reference, the amount, the currency, and the occurrence time are all the
**provider's** own headers and fields.

**Body.** The **provider's own** format. The platform verifies it and maps it into its own
vocabulary, so a provider's types never become a core domain model. The published document
therefore describes the body as a free-form object.

**Verification, in a fixed order.**

1. The **signature** over the **raw** body. A body altered after it was signed fails.
2. The **identifier**, which is what makes the delivery deduplicated.
3. The **shape**: the body must parse as a JSON object.
4. The **timestamp**, which must be inside the accepted window. A stale event is refused.

**Response `200`.** `{ "received": true, "outcome": "APPLIED" }`, where the outcome is `APPLIED`,
`DUPLICATE`, `REJECTED`, or `UNKNOWN_ORDER`.

**Errors.**

| Code                      | Status | Meaning                                                                |
| ------------------------- | ------ | ---------------------------------------------------------------------- |
| `PAYMENT_EVENT_UNVERIFIED` | 401    | The signature, the identifier, the shape, or the timestamp failed.     |
| `VALIDATION_ERROR`        | 400    | The body was not usable.                                                 |

**A refused event changes nothing**, and the refusal is recorded, so an attempt to forge a payment
is visible to an operator.

## The administrative payment routes

Every route below requires the `ADMIN` role. The administrative surface **reads** payments and
issues refunds; it never collects money and never fabricates a payment success.

| Method | Path                                              | Purpose                                        |
| ------ | ------------------------------------------------- | ---------------------------------------------- |
| `GET`  | `/api/v1/admin/payments`                           | List every payment attempt, newest first       |
| `GET`  | `/api/v1/admin/payments/events`                    | List the recorded provider events              |
| `POST` | `/api/v1/admin/payments/refunds`                   | Refund a payment, in full or in part (`201`)   |
| `GET`  | `/api/v1/admin/payments/attempts/{paymentAttemptId}/refunds` | List the refunds of one attempt       |
| `GET`  | `/api/v1/admin/payments/reconciliation`            | Compare the platform's records with the provider's |

### `POST /api/v1/admin/payments/refunds`

**Headers.**

```
Idempotency-Key: <a stable business key, at least eight characters>
```

**Request.**

```json
{ "paymentAttemptId": "3a1b...", "amountMinor": 74043, "reason": "Damaged on arrival" }
```

The amount is the exact integer minor units the refund covers. The refunds for one payment can
**never** exceed the amount that was paid, even when two refunds race, because the refunded total is
advanced with a conditional update inside the write.

**Response `201`.** `{ "refundId": "5c9d...", "status": "SUCCEEDED", "amountMinor": 74043 }`

**Errors.**

| Code                      | Status | Meaning                                                    |
| ------------------------- | ------ | ---------------------------------------------------------- |
| `PAYMENT_NOT_FOUND`       | 404    | No such attempt, or it belongs to another customer.         |
| `REFUND_NOT_ALLOWED`      | 409    | The payment is not in a state that can be refunded.         |
| `REFUND_EXCEEDS_PAYMENT`  | 409    | The refund would exceed the amount that was paid.           |

The refusal reports the **remaining refundable amount** in its details, so a caller can compute the
correct amount.

### `GET /api/v1/admin/payments/reconciliation`

Compares the platform's payment records with the provider's and reports every difference. The
provider is the authority, so a difference is **reported** rather than silently resolved in the
platform's favour. The operation is a **read**: it reports and records, and it never moves money.

**Response `200`.** `{ "checked": 12, "differences": [ ... ] }`

## The payment states

| State        | Meaning                                                                |
| ------------ | ---------------------------------------------------------------------- |
| `PENDING`    | The attempt exists and the provider has not answered.                   |
| `SUCCEEDED`  | The payment was recorded and the order was advanced.                     |
| `FAILED`     | The payment attempt failed and the order's hold was released.            |
| `CANCELLED`  | The attempt was cancelled.                                             |
| `REFUNDED`   | The refunds cover the whole amount that was paid.                       |

The refund's states are `PENDING`, `SUCCEEDED`, and `FAILED`.

## The error catalogue

The milestone adds six codes to the closed set of application error codes:

| Code                      | Status | Meaning                                                  |
| ------------------------- | ------ | -------------------------------------------------------- |
| `PAYMENT_NOT_FOUND`       | 404    | No such payment attempt, or it is not the caller's.      |
| `REFUND_NOT_FOUND`        | 404    | No such refund.                                          |
| `PAYMENT_NOT_PAYABLE`     | 409    | The order is not awaiting payment.                       |
| `REFUND_NOT_ALLOWED`      | 409    | The payment cannot be refunded.                          |
| `REFUND_EXCEEDS_PAYMENT`  | 409    | The refund would exceed the amount that was paid.        |
| `PAYMENT_EVENT_UNVERIFIED` | 401    | The provider event could not be verified.                |

## The provider abstraction

The platform's payment behaviour is written against a small provider interface, and every
provider-specific type is confined to its adapter. The interface is:

```ts
export interface PaymentProvider {
  readonly name: string;
  isAvailable(): boolean;
  createPayment(request: ProviderPaymentRequest): Promise<ProviderPaymentResult>;
  capturePayment(request: ProviderPaymentRequest): Promise<ProviderPaymentResult>;
  refundPayment(request: ProviderRefundRequest): Promise<ProviderRefundResult>;
  verifyEvent(rawBody, headers): ProviderEventVerification;
  lookupPayment(providerReference): Promise<ProviderPaymentResult | null>;
}
```

**The only shipped provider is a non-production simulation** that refuses to operate in a production
environment, so a production request can never collect money. The simulation produces the success,
failure, timeout, duplicate, and delayed outcomes the platform must survive, deterministically and
without contacting any external service.

The **Paymob adapter interface and its contract assumptions are prepared** in
[paymob-adapter-assumptions.md](./paymob-adapter-assumptions.md), with **no** Paymob behaviour
implemented and **no** claim of a production integration. The assumptions are recorded as
unverified, so a future implementation starts from a known list of questions.

## The published contracts

| Contract                          | Owner   | Purpose                                                       |
| --------------------------------- | ------- | ------------------------------------------------------------- |
| `ORDER_LEDGER` / `OrderLedger`    | Orders  | Records a verified payment or a failure against an order, and releases the hold on a failure. |
| `PAYMENT_PROVIDER` / `PaymentProvider` | Payments | The provider abstraction a new adapter implements.        |

## Independent remediation contract addendum — 2026-10-21

See [the remediation design](../../../docs/audits/m06-m10-remediation-design.md) for the authenticated pre-order conversion, exact amount/currency checks, full/partial order refund projection, AMOUNT_UNSUPPORTED blocker, 200-character idempotency bound and corrected local raw-body/metadata signing protocol. Existing operation identities remain stable; the new conversion operation is explicitly inventoried. Production provider/tax activation remains blocked.
