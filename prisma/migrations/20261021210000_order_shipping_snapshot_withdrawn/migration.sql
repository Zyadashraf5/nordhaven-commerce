-- Milestone 11: withdraw the order's shipping columns.
--
-- The Milestone 11 design first intended the shipping amount to join the order's total. The
-- dependency graph does not permit it: the Shipping capability must depend on the Orders capability
-- (a shipment is created for an order) and on the Payments capability (a received return is
-- refunded), and the Payments capability already depends on the Orders capability. A Checkout
-- capability that depended on the Shipping capability would therefore close the cycle
-- Checkout -> Shipping -> Payments -> Orders -> Checkout.
--
-- Charging a shipping amount is also not yet approved: HC-DEC-013 leaves the shipping providers,
-- the rate calculation, and the service areas open, and the instruction for this milestone forbids
-- inventing a shipping rate. The configured method amount is therefore recorded on the shipment and
-- is not collected, and the order's figures are unchanged.
--
-- This migration is a forward migration that removes the columns the previous migration added. The
-- columns were added during the same unreleased milestone, they were never populated with a
-- commercial figure, and no business row is affected: every order still satisfies
-- `subtotal_minor + tax_total_minor = total_minor`, which is the constraint this migration restores.

ALTER TABLE "orders" DROP CONSTRAINT "orders_amounts_consistent";
ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts_consistent" CHECK ("subtotal_minor" + "tax_total_minor" = "total_minor");

ALTER TABLE "orders" DROP CONSTRAINT "orders_shipping_amount_nonnegative";
ALTER TABLE "orders" DROP CONSTRAINT "orders_shipping_amount_within_range";

ALTER TABLE "orders" DROP COLUMN "shipping_minor";
ALTER TABLE "orders" DROP COLUMN "shipping_method_code";
ALTER TABLE "orders" DROP COLUMN "shipping_method_label";
ALTER TABLE "orders" DROP COLUMN "shipping_currency";
