# Paymob Adapter: Interface and Contract Assumptions

**Date**: 2026-10-21

**Status**: **Interface prepared, adapter NOT implemented and NOT activated.** The Product Owner
approved the development scope on 2026-10-21 with Paymob as the *preferred candidate* for future
Egyptian processing, explicitly **not** as an activated provider.

## What this document is

This document states the **interface** a Paymob adapter would implement and the **assumptions** that
implementation would rest on. It is a preparation, not an implementation.

**No Paymob behavior is implemented here, and none is claimed.** The assumptions below are
**unverified**: they are the questions a future implementer must answer against Paymob's own
published documentation and a reviewed contract, not facts this repository has established.

## The interface

A Paymob adapter implements the platform's provider interface, which is deliberately small:

```ts
export interface PaymentProvider {
  readonly name: string;
  isAvailable(): boolean;
  createPayment(request: ProviderPaymentRequest): Promise<ProviderPaymentResult>;
  capturePayment(request: ProviderPaymentRequest): Promise<ProviderPaymentResult>;
  refundPayment(request: ProviderRefundRequest): Promise<ProviderRefundResult>;
  verifyEvent(
    rawBody: string,
    headers: Readonly<Record<string, string | undefined>>,
  ): ProviderEventVerification;
  lookupPayment(providerReference: string): Promise<ProviderPaymentResult | null>;
}
```

The adapter translates between Paymob's vocabulary and the platform's. The platform's own types are
never replaced by Paymob's, and a Paymob type never becomes a core domain model.

## The assumptions an implementation would rest on

Each assumption is **unverified** and names the question that must be answered before the code is
written.

| # | Assumption | The question that must be answered first |
| - | ---------- | ------------------------------------------- |
| A1 | An intention is created against an order's identifier and an amount in minor units. | What is Paymob's exact field for the amount, and in what unit? Minor units or the smallest unit of the currency? |
| A2 | The provider returns a reference that identifies the payment. | Which field is the durable reference, and is it unique per intention or per transaction? |
| A3 | A transaction carries a status whose vocabulary maps onto `PENDING`, `SUCCEEDED`, `FAILED`, and `CANCELLED`. | What is the complete status vocabulary, and which values are terminal? Are there statuses that do not map onto the platform's four? |
| A4 | A webhook body is authenticated by an HMAC over the raw body. | Which algorithm, which key, which header, and which fields are covered by the signature? Is the signature over the raw body or over a canonical field order? |
| A5 | A webhook body carries the provider's own event identifier. | Which field is the durable event identifier, and is it unique per provider? |
| A6 | A webhook body carries a timestamp. | Which field, and in what format and timezone? What is the acceptable delivery delay? |
| A7 | A webhook states the amount that was paid. | Which field, and in what unit? |
| A8 | A refund references the original transaction. | Which field links a refund to its transaction, and is a full refund expressed as a distinct operation or as a transaction with a refund flag? |
| A9 | A refund is idempotent on a key the caller supplies. | Does Paymob accept a caller-supplied idempotency key, and how long is it retained? |
| A10 | The transaction's status can be read back. | Which endpoint returns it, and is it eventually consistent? |
| A11 | A timeout is distinguishable from a failure. | What does Paymob return when a request times out, and is the transaction then queryable? |
| A12 | Credentials are supplied by configuration. | Which credentials exist, which environment each belongs to, and how are they rotated? |

**A4 and A6 are the load-bearing ones.** The platform's event verification depends on the
signature and the timestamp, and both assumptions are unverified. An implementation written against
a wrong assumption about either would accept a forged event or reject a legitimate one, so the
signature scheme must be confirmed against Paymob's own documentation and a reviewed contract
**before** any adapter is written.

## What is deliberately not done

- **No Paymob request or response shape is written.** Writing one from memory would be inventing
  undocumented provider behavior, which the approved decision forbids.
- **No Paymob credential is read, stored, or required.** There is no environment key for one.
- **No Paymob adapter is registered.** The `PAYMENT_PROVIDER` token binds the local test provider,
  and only the local test provider is shipped.
- **No production behaviour is claimed.** The published OpenAPI contract describes the platform's own
  payment routes; the provider's route is documented as a free-form body precisely because the
  provider's shape is not yet known.

## The activation path

1. Answer every assumption above against Paymob's published documentation.
2. Review and sign off the provider contract with the finance, product, security, and architecture
   owners, which is the activation blocker **HC-DEC-007** records.
3. Implement the adapter against the reviewed contract, with the local test provider kept as the
   non-production default.
4. Configure the credentials through the approved secrets mechanism, scoped and rotatable.
5. Prove the adapter against a Paymob sandbox with the same automated suite that proves the local
   test provider, including the forged, the stale, the duplicate, and the delayed deliveries.

Until step 2 is complete, the platform's payment path is the **non-production** simulation, and a
production request cannot collect money through it.
