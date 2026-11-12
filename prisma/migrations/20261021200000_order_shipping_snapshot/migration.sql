-- Milestone 11: the order's shipping snapshot and the updated order consistency constraint.
--
-- Additive: four columns on `orders`, all with a safe default, and one constraint replaced.
--
-- The order snapshots the selected shipping method's code, label, amount, and currency. The snapshot
-- is what makes a later deactivation or repricing of the method unable to alter an existing order,
-- exactly as the line prices and the tax snapshot behave.
--
-- The order's identity becomes `subtotal + shipping + tax = total`, so an order whose figures do not
-- add up cannot be stored. The shipping amount is not taxed, because no shipping tax classification
-- is approved; the assumption is recorded in the milestone's specification.
--
-- No existing row is rewritten: the new columns default to zero and to null, which is the correct
-- value for every order that was placed before a shipping method existed.

ALTER TABLE "orders" ADD COLUMN "shipping_minor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN "shipping_method_code" TEXT;
ALTER TABLE "orders" ADD COLUMN "shipping_method_label" TEXT;
ALTER TABLE "orders" ADD COLUMN "shipping_currency" CHAR(3);

-- The shipped amount is never negative and stays inside the platform's stored integer range.
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_amount_nonnegative" CHECK ("shipping_minor" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_amount_within_range" CHECK ("shipping_minor" <= 2000000000);

-- The order's figures must add up exactly, including the shipping amount.
ALTER TABLE "orders" DROP CONSTRAINT "orders_amounts_consistent";
ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts_consistent" CHECK ("subtotal_minor" + "shipping_minor" + "tax_total_minor" = "total_minor");
