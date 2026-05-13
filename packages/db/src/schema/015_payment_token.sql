-- Payment token for public pay links (emailed to customers)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_token uuid NOT NULL DEFAULT uuid_generate_v4();

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_token ON orders(payment_token);
