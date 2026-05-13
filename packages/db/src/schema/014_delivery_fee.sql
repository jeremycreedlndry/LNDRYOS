-- ─── Delivery fee per customer ───────────────────────────────────────────────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS delivery_fee_cents integer NOT NULL DEFAULT 0;

-- ─── End date for recurring pickup schedules ─────────────────────────────────
ALTER TABLE pickup_schedules
  ADD COLUMN IF NOT EXISTS end_date date;
