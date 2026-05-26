-- ── Add detail_at and cleaning_at timestamps to orders ───────────────────────

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS detail_at   timestamptz,
  ADD COLUMN IF NOT EXISTS cleaning_at timestamptz;

-- ── Trigger: auto-stamp when status changes ───────────────────────────────────

CREATE OR REPLACE FUNCTION stamp_order_status_times()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Stamp detail_at the first time status becomes 'detail'
  IF NEW.status = 'detail' AND OLD.status <> 'detail' AND NEW.detail_at IS NULL THEN
    NEW.detail_at := now();
  END IF;

  -- Stamp cleaning_at the first time status becomes 'cleaning'
  IF NEW.status = 'cleaning' AND OLD.status <> 'cleaning' AND NEW.cleaning_at IS NULL THEN
    NEW.cleaning_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_order_status_times ON orders;
CREATE TRIGGER trg_stamp_order_status_times
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION stamp_order_status_times();

-- ── Backfill existing orders ──────────────────────────────────────────────────

-- Orders currently in 'detail': use created_at as best approximation
UPDATE orders
SET detail_at = created_at
WHERE status = 'detail'
  AND detail_at IS NULL;

-- Orders in cleaning or beyond (cleaning/ready/picked_up/delivered):
-- they've been through cleaning — use created_at as best approximation
UPDATE orders
SET cleaning_at = created_at
WHERE status IN ('cleaning', 'ready', 'picked_up', 'delivered')
  AND cleaning_at IS NULL;

-- ── Backfill due_date for active orders that don't have one ───────────────────
-- Use cleaning_at + 1 day (in local Toronto time) as the due date

UPDATE orders
SET due_date = (cleaning_at AT TIME ZONE 'America/Toronto')::date + INTERVAL '1 day'
WHERE due_date IS NULL
  AND cleaning_at IS NOT NULL
  AND status NOT IN ('cancelled', 'picked_up', 'delivered');
