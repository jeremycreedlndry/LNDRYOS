-- ── Delivery fee on orders ────────────────────────────────────────────────────
-- Track the delivery fee charged per-order (stamped at creation time)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_fee_cents integer NOT NULL DEFAULT 0;

-- ── Per-customer delivery fee: make nullable ──────────────────────────────────
-- NULL = use the tenant's default delivery fee setting
-- 0    = explicitly waived for this customer
-- >0   = customer-specific override
ALTER TABLE customers
  ALTER COLUMN delivery_fee_cents DROP NOT NULL,
  ALTER COLUMN delivery_fee_cents DROP DEFAULT;
