# Feature Specification: Milestone 07 - Cart and Wishlist

**Feature Branch**: Not created; the repository has no commits yet and no `before_specify` branch hook
is configured

**Created**: 2026-10-20

**Status**: Draft for Product Owner review; implementation authorized by the autonomous development
instruction of 2026-10-20

**Approval**: This specification implements the approved product facts **HC-IAM-002** (an authenticated
customer account is required to use a cart; guest carts are not supported), **HC-IAM-003**
(registered customers can maintain a wishlist), and the cart half of **HC-COM-001** (the server
revalidates cart pricing and informs the customer of any changes, by making the current price and the
change visible in the cart). **HC-DEC-004** (the checkout state machine, reservation timing, and
order-creation boundary) remains open, so this milestone creates **no checkout, no order, no
payment, and no reservation**. Hosted continuous integration remains deferred and NOT VERIFIED.

**Input**: User description: "Milestone 07: Cart and Wishlist for Nordhaven Commerce - an
authenticated customer's cart of catalog SKUs with a quantity, the last-known price the customer
agreed to, the current price, and a clear signal when the two differ, plus a wishlist of catalog
products, all scoped to the session, exposed through versioned REST and OpenAPI, with validation,
migrations, unit, integration, and end-to-end tests."

## Scope Boundaries and Open Decisions

- **HC-IAM-002 (Approved)** - a cart requires an authenticated customer account. There is no guest
  cart, no guest checkout, and no anonymous cart surface.
- **HC-IAM-003 (Approved)** - a registered customer maintains a wishlist of catalog products.
- **HC-COM-001 (Approved, cart half)** - the server revalidates cart pricing and informs the
  customer of any changes. This milestone makes both prices and the difference visible on every cart
  read; the authoritative revalidation and the customer-facing change notice remain checkout
  behavior under **HC-DEC-004**.
- **HC-DEC-004 (Open)** - the checkout state machine, validation sequence, reservation timing,
  failure recovery, and order-creation boundary are unresolved. This milestone therefore creates
  **no reservation**, holds **no stock**, prices **nothing** beyond a reference, and performs **no
  checkout**. A cart is an intent record, not a commitment.
- **HC-DEC-019 (Open, recorded by this milestone)** - the cart lifecycle is not approved: one active
  cart per customer or several, whether a cart expires, and whether a cart is merged or discarded.
  This milestone implements the conservative interpretation recorded in the decision register.
- **HC-DEC-009 and HC-DEC-008 (Open)** - no converted amount, display quote, or settlement currency
  exists. A cart stores and reports the base currency only.
- **HC-DEC-017 (Approved)** - a FIXED bundle is independent stocked finished goods. A cart line in
  this milestone references a **catalog SKU** only. A bundle cart line needs the bundle selection
  rule for a DYNAMIC bundle and the bundle availability contract, and it is deferred to the
  Milestone 08 plan with that reason recorded.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Keep a cart of the things the customer intends to buy (Priority: P1)

A customer signs in, adds a SKU to their cart, changes the quantity, and removes it again. The cart
belongs to that customer alone: no request can name another customer's cart, and an anonymous
caller cannot have one at all. The cart survives across sessions, so a customer can come back to it.

**Why this priority**: A cart is the entry point to every later commerce capability, and it is
independently valuable and testable. Nothing else about shopping works without it.

**Independent Test**: Sign in as a customer, add a SKU, read the cart back, change the quantity,
remove the line, and confirm the cart is empty; then confirm a second customer sees a different
cart and an anonymous caller is refused.

**Acceptance Scenarios**:

1. **Given** a signed-in customer and a published SKU, **When** the customer adds it with a
   quantity, **Then** the cart holds one line for that SKU with that quantity.
2. **Given** a line already in the cart, **When** the customer adds the same SKU again, **Then** the
   quantity is increased rather than a second line appearing.
3. **Given** a line in the cart, **When** the customer changes its quantity, **Then** the cart
   reports the new quantity.
4. **Given** a line in the cart, **When** the customer removes it, **Then** the cart no longer holds
   it.
5. **Given** a customer with no cart yet, **When** the customer reads the cart, **Then** an empty
   cart is returned rather than an error.
6. **Given** an anonymous caller, **When** the caller reaches any cart route, **Then** the request
   is refused with the documented authorization error and nothing is created.
7. **Given** a customer, **When** the customer reads the cart, **Then** only that customer's cart is
   returned; another customer's line is never visible.
8. **Given** a SKU that does not exist, **When** the customer adds it, **Then** the request is
   refused with the documented not-found error.

---

### User Story 2 - See what the customer agreed to pay and what the price is now (Priority: P1)

A customer returns to a cart days later. The price may have changed while they were away. The cart
shows both the price the customer last agreed to and the current price, and says plainly whether
they differ, so the customer is never surprised at checkout and the server never silently changes
what the customer agreed to.

**Why this priority**: HC-COM-001 requires the server to revalidate pricing and inform the customer
of changes. Making the comparison visible in the cart is what makes the later checkout revalidation
trustworthy, and it is the part of the requirement that can be delivered without the open checkout
decision.

**Independent Test**: Add a SKU to a cart, change the product's price in the catalog, read the cart,
and confirm the line reports the old price, the new price, and that they differ; then change the
price back and confirm the signal clears.

**Acceptance Scenarios**:

1. **Given** a cart line added at one price, **When** the catalog price is unchanged, **Then** the
   line reports the same price for both the last-known and the current amount, and reports that they
   do not differ.
2. **Given** a cart line added at one price, **When** the catalog price has since changed, **Then** the
   line reports the last-known price, the current price, and that they differ.
3. **Given** a discounted product, **When** the cart reports the current price, **Then** the
   current price is the effective price, so the cart and the storefront never disagree.
4. **Given** a line whose product is no longer published, **When** the cart is read, **Then** the
   line is reported as no longer purchasable rather than being silently removed.
5. **Given** a line whose price changed, **When** the customer changes the line's quantity, **Then**
   the last-known price is refreshed to the current price, because the customer has just made a new
   decision about that item.

---

### User Story 3 - Keep a wishlist of products the customer wants later (Priority: P2)

A customer saves a product they are interested in but have not decided to buy, and later removes it
or finds out that the product is no longer available. The wishlist is a private, per-customer list
and behaves predictably when the same product is saved twice.

**Why this priority**: A wishlist is a retention and convenience feature rather than a step toward
a purchase. It depends on the same catalog identity the cart uses, so it is a natural second slice
once the cart's ownership model is proven.

**Independent Test**: Sign in as a customer, save a product, read the wishlist, save the same
product again, remove it, and confirm the wishlist is empty and the removal of an item that is not
there is refused.

**Acceptance Scenarios**:

1. **Given** a signed-in customer and a published product, **When** the customer saves it, **Then**
   the wishlist holds that product exactly once.
2. **Given** a product already in the wishlist, **When** the customer saves it again, **Then** the
   wishlist still holds it exactly once.
3. **Given** a product in the wishlist, **When** the customer removes it, **Then** the wishlist no
   longer holds it.
4. **Given** an item that is not in the wishlist, **When** the customer removes it, **Then** the
   request is refused with the documented not-found error and the wishlist is unchanged.
5. **Given** a product that is no longer published, **When** the wishlist is read, **Then** the item
   is reported as no longer purchasable rather than being silently removed.
6. **Given** an anonymous caller, **When** the caller reaches any wishlist route, **Then** the
   request is refused with the documented authorization error.

---

### Edge Cases

- Adding a SKU whose product is not published is refused, exactly like a catalog browse that hides
  an unpublished product.
- Adding a SKU whose product is published but whose stock is empty is still accepted: a cart holds
  an intent, and availability is revalidated at checkout under HC-DEC-004.
- A quantity of zero or a negative quantity is refused rather than being clamped.
- A quantity beyond the per-line maximum is refused rather than being silently capped.
- Adding the same SKU twice raises the quantity rather than creating a second line.
- A cart line whose product was archived after the line was added is reported as no longer
  purchasable, and the line is not silently deleted.
- A price change that happens while the cart is being read is resolved by the next read, not by a
  partial write.
- A wishlist entry for a product that was deleted is removed with the product, so the wishlist never
  references a product that no longer exists.
- A customer with an empty cart and a customer with no cart at all receive the same answer.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The cart MUST be reachable only by an authenticated customer, and every cart route
  MUST refuse an anonymous caller.
- **FR-002**: A cart MUST belong to exactly one customer, and no request may name or reach another
  customer's cart.
- **FR-003**: A cart MUST hold a line per catalog SKU with a positive quantity, and the quantity
  MUST be between one and the declared per-line maximum.
- **FR-004**: Adding a SKU that is already in the cart MUST increase that line's quantity rather
  than create a second line for the same SKU.
- **FR-005**: A cart line MUST store the last-known unit price, in exact integer minor units with
  an explicit currency, and the effective price of the product at the moment the line was last
  written.
- **FR-006**: A cart read MUST report, per line, the last-known unit price, the current effective
  unit price, and whether the two differ.
- **FR-007**: A cart read MUST report whether the line's product is still published, and MUST NOT
  remove a line whose product is no longer published.
- **FR-008**: A cart MUST be readable when it does not exist yet, and MUST then be empty.
- **FR-009**: The wishlist MUST hold a catalog product at most once per customer, MUST be reachable
  only by an authenticated customer, and MUST never be readable or writable by another customer.
- **FR-010**: A wishlist read MUST report, per item, whether the product is still published, and
  MUST NOT remove an item whose product is no longer published.
- **FR-011**: Removing a cart line or a wishlist item that is not present MUST be refused with the
  documented not-found error, and MUST leave the collection unchanged.
- **FR-012**: Every quantity, identifier, and price MUST be validated and normalized at the request
  boundary, and an invalid value MUST be refused with the stable validation error.
- **FR-013**: Every price MUST be an exact integer count of minor units in an explicit currency, and
  no binary floating-point value may be used to compute a monetary amount.
- **FR-014**: The cart MUST NOT reserve, hold, or decrement stock, and MUST NOT create a checkout, an
  order, or a payment.
- **FR-015**: The capability MUST add no new runtime or development dependency, no new
  configuration key, and no new infrastructure, and MUST add no new cross-module code import: it
  references the catalog only through a declared foreign key and reads the referenced rows through
  that relation, exactly as the Inventory module does.
- **FR-016**: The REST contract MUST be described in the OpenAPI document, and the documented
  operation inventory, authorization metadata, and excluded-domain scan MUST remain enforced.
- **FR-017**: The customer-facing cart and wishlist routes MUST be protected by the customer role,
  so an administrator account cannot use them.
- **FR-018**: No personal data beyond the authenticated principal is introduced, so no new
  log-redaction path is required; the assessment MUST be recorded.
- **FR-019**: A cart line MUST NOT be able to reference a SKU that does not exist, and a wishlist
  item MUST NOT be able to reference a product that does not exist, so neither collection can hold a
  dangling reference.

### Key Entities

- **Cart**: the authenticated customer's collection of intended purchases, holding one line per
  catalog SKU.
- **Cart line**: one catalog SKU with a quantity, the last-known unit price, and the currency of
  that price.
- **Wishlist item**: one catalog product the customer has saved for later.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A cart read over a cart of the maximum supported number of lines answers within
  300 ms at the ninety-fifth percentile on the reference development database.
- **SC-002**: Two customers can act on their carts at the same time and neither can observe or
  change the other's cart, and a concurrent write to one customer's cart never affects another's.
- **SC-003**: A price change between adding to the cart and reading the cart is always visible as
  a difference, and the difference is never silently resolved in the customer's favor or against
  them.
- **SC-004**: Every documented cart and wishlist behavior, including every denial path and the
  database constraints, is proven by an automated test at the narrowest useful level.
- **SC-005**: The complete quality gate passes and the previous milestones' behavior is unchanged.

## Assumptions

- **M07-ASM-001**: One customer has one cart. Guest carts do not exist, so there is no guest-cart
  merge to perform, and the cart lifecycle question is recorded as HC-DEC-019.
- **M07-ASM-002**: The last-known unit price is refreshed on every write to a line, so it always
  means "the price at the customer's most recent decision about this line".
- **M07-ASM-003**: A cart holds catalog SKUs only. A bundle line needs the bundle selection rule
  and the bundle availability contract, both of which belong to the Milestone 08 plan.
- **M07-ASM-004**: A cart does not check stock. Availability is revalidated at checkout under
  HC-DEC-004, and the Inventory module publishes no customer-facing availability contract.
- **M07-ASM-005**: A wishlist holds catalog products, not SKUs, because a wishlist records
  interest in a product rather than a decision about a specific variant.
- **M07-ASM-006**: A published product can be added to a cart and to a wishlist. An unpublished or
  archived product cannot, and is reported as not found to a customer, matching the catalog's
  existing rule that an unpublished product is invisible.
