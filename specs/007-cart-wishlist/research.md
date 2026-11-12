# Research: Milestone 07 - Cart and Wishlist

> Independent remediation note (2026-10-21): historical assumptions about detached transactions, constant-only order TTL, foreign root lookups and provider/refund/pre-order behavior are superseded by [the audited remediation design](../../docs/audits/m06-m10-remediation-design.md). Approved business decisions and the constitution are unchanged.

**Date**: 2026-10-20

## Findings

### R1 - The Cart is a new module; the Wishlist joins the Customers module

The architecture overview assigns the cart to a "Cart" capability and the wishlist ownership to the
"Customers" capability. Both assignments are followed:

- The **Cart** becomes a new module. A cart is a distinct business capability with its own rules
  (quantities, last-known prices, the purchasable signal) and it is the object a future checkout
  will read. It also needs the widest set of future dependencies, so keeping it separate keeps the
  Customers module small.
- The **Wishlist** joins the **Customers** module. A wishlist is a per-customer collection of
  catalog identifiers, which is exactly what the Customers module already owns, and it reuses the
  existing customer-scoped route family under `/customers/me`.

Splitting them this way means the two collections are not forced into one module, and neither
module has to import the other.

### R2 - The Cart references catalog SKUs through a declared foreign key, and imports no catalog code

The Inventory module established the precedent in Milestone 05 (research R2): a module may hold a
deliberate foreign key to another module's table, and it imports none of that module's code. The
Cart follows the same pattern:

- `cart_items.variant_id` is a foreign key to `product_variants.id`, with `ON DELETE RESTRICT`, so a
  SKU that is in someone's cart cannot be deleted out from under them. This is the same protection
  the Inventory module gives a SKU that still holds stock, and it matches the Milestone 04
  administrative contract, which already refuses to remove a variant a later dependent references.
- The Cart reads the SKU, the product name, and the current effective price through that relation.
  It never imports the Catalog module and never queries the Catalog tables directly.

The consequence is that the Cart is consistent with the Catalog's own deletion rules without a
cross-module code dependency, and the module boundary check continues to pass.

### R3 - The Wishlist references catalog products through a declared foreign key

The Customers module deliberately keeps **no** foreign key to the Identity-owned `users` table, so
that the two modules' schema evolution stays uncoupled (Milestone 03 research). The same reasoning
does not transfer to the Catalog for the wishlist, because the two risks are different:

- The Identity risk is a **deletion lifecycle** that is unresolved: HC-DEC-003 leaves account
  deletion, export, and retention undefined, so a cross-module key would couple the two modules
  while the deletion rule is still being decided.
- The Catalog risk is a **deletion of a row the customer explicitly saved**, and the Catalog's
  deletion behavior is already decided: removing a product removes its images, attributes, and
  variants. A wishlist entry that referenced a deleted product would be a dangling reference to
  something the customer can no longer buy or see.

So the wishlist item holds a foreign key to `products.id` with `ON DELETE CASCADE`, which guarantees
that a wishlist never references a product that no longer exists, and satisfies FR-019 directly at
the storage layer rather than in application code.

The M05 precedent for a deliberate cross-module foreign key is what makes this acceptable inside the
Customers module, whose own table set is otherwise free of cross-module keys.

### R4 - A cart line stores the last-known price, and the current price is read live

HC-COM-001 requires the server to revalidate cart pricing and inform the customer of any changes.
The cart is where that comparison can be made without deciding the checkout sequence, which
HC-DEC-004 has not settled.

Two prices are therefore reported per line:

- The **last-known unit price**, stored on the line. It is the price the customer agreed to, and it
  is the value a later checkout would compare against.
- The **current effective unit price**, read live from the Catalog through the declared foreign key.
  It is the price the customer would pay now.

and a boolean saying whether they differ. A cart that stored only one price would make the change
invisible, and a cart that stored only the current price would silently overwrite what the customer
agreed to. Both are wrong, so both are reported.

The live price is the **effective** price, so the cart and the storefront can never disagree about
what a product costs.

### R5 - The last-known price is refreshed on every write to a line

The last-known price means "the price at the customer's most recent decision about this line". When
the customer adds the item or changes the quantity, they are making a fresh decision, so the
reference is refreshed to the current price at that moment. When the customer only reads the cart,
nothing is written, so the reference survives and the difference stays visible.

Refreshing on every write rather than only on creation keeps one rule with no special cases, and it
means a difference always means "the price changed after your last action", which is exactly the
signal a shopper needs.

### R6 - A cart holds catalog SKUs only, and a bundle line is deferred

A FIXED bundle is an independently stocked finished good, and a DYNAMIC bundle needs a customer
selection. A cart line for either would therefore need to carry a bundle selection, resolve bundle
availability, and decide how a bundle price is presented next to a SKU price. The bundle selection
rule is part of the checkout boundary that HC-DEC-004 has not resolved, and the Inventory module
publishes no customer-facing bundle availability contract.

Shipping a bundle cart line now would require inventing the selection rule. The milestone therefore
delivers a cart of catalog SKUs, and the bundle line is deferred to the Milestone 08 plan with that
reason recorded. This is the same discipline the M05 milestone applied to dynamic bundle
reservations.

### R7 - A cart does not check or hold stock

A cart holds an intent, not a commitment. Holding stock would be a reservation, and the reservation
timing is exactly what HC-DEC-004 leaves open. A cart therefore:

- never creates a reservation,
- never decrements or reads on-hand stock to decide whether an add is allowed,
- and never blocks a purchase that is currently out of stock.

The Inventory module publishes only administrative routes, so there is no customer-facing
availability contract to consult even if the milestone wanted to. Availability is revalidated at
checkout, and the milestone makes the pricing half of that visible now.

### R8 - The cart and the wishlist are protected by the customer role

The Customers module already protects its own routes with `@Roles('CUSTOMER')`, so an administrator
account is refused. The cart and the wishlist follow the same rule, because HC-IAM-002 says a
**customer** account is required, and an administrator is not a customer. This also means the
administrator interface can never be used to read a customer's cart, which is a privacy property
rather than a convenience.

### R9 - The cart is scoped by the principal's own identifier, never by a supplied identifier

Every route is scoped to the authenticated principal, exactly as the Customers module is. No request
body, path, or query parameter can name a customer or a cart, so there is no identifier to guess
and no cross-customer access to test for.

The Cart stores the principal's user identifier as a stable foreign identifier, with **no** foreign
key to the Identity-owned `users` table, for the same reason the Customers module does: HC-DEC-003
leaves account deletion and retention unresolved, and a cross-module key would couple the two
modules' schema evolution while that decision is open.

### R10 - No new error code is needed beyond two not-found codes

The cart introduces two genuinely new "not found" outcomes - a cart line and a wishlist item - so
`CART_ITEM_NOT_FOUND` and `WISHLIST_ITEM_NOT_FOUND` are added. Every other outcome reuses an
existing code: an invalid quantity or identifier is `VALIDATION_ERROR`, an unknown or unpublished
SKU is `VARIANT_NOT_FOUND`, an unknown or unpublished product is `PRODUCT_NOT_FOUND`, and an
unauthorized caller is `UNAUTHENTICATED` or `FORBIDDEN`.

The error contract therefore grows by exactly two codes, and the closed union stays auditable.

### R11 - The line quantity is bounded

A cart line carries a positive integer quantity, bounded at the per-line maximum. The bound is
declared as a constant and is asserted at the request boundary; a quantity beyond it is refused
rather than clamped, so a caller is never told "we added less than you asked for" without being
told.

The same bound is asserted by a database `CHECK` constraint, so the storage layer refuses an
out-of-range quantity written by any writer.

### R12 - A line is unique per SKU within a cart

A cart holds at most one line per SKU, enforced by a unique constraint on `(cart_id, variant_id)`.
Adding the same SKU again therefore increases the existing line's quantity, which is what a shopper
expects, and it makes the "one line per SKU" rule structural rather than a convention.

### R13 - A published product can be added; an unpublished one is invisible to a customer

The Catalog already answers an unpublished product as not found, so that browsing discloses nothing
about the commercial pipeline. A cart and a wishlist follow the same rule: adding an unpublished
product is refused with the same not-found answer, and a line whose product was archived after it
was added is reported as no longer purchasable rather than being silently removed - the customer
must be able to see that something changed.

### R14 - The recorded open decision

The cart lifecycle is not approved anywhere. **HC-DEC-019** records it: whether a customer has one
cart or several, whether a cart expires, and whether a cart is merged or discarded. This milestone
implements the conservative interpretation - one cart per customer, no expiry, no merge - and
records it for the Product Owner, exactly as Milestone 06 did for the discount's form.

### R15 - No new dependency, configuration key, or infrastructure

The capability uses the platform as it stands: the same global guard chain, the same Zod boundary
pipe, the same safe error envelope, the same authorization audit boundary, the same structured
logger and redaction, and the same OpenAPI inventory assertion. The only new persistent objects are
the two tables and their constraints, added by one additive migration.
