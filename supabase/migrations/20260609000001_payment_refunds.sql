-- Add refund tracking to payments table
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS refund_of_payment_id uuid REFERENCES payments(id),
  ADD COLUMN IF NOT EXISTS notes text;

-- Update the order payment trigger to subtract refunded amounts from paid_amount
CREATE OR REPLACE FUNCTION update_order_payment_status()
RETURNS TRIGGER AS $$
DECLARE
  v_paid_amount    integer;
  v_total_amount   integer;
  v_new_status     text;
BEGIN
  -- Sum paid payments minus refunded payments for this order
  SELECT
    COALESCE(SUM(CASE WHEN status = 'paid'     THEN amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN status = 'refunded' THEN amount ELSE 0 END), 0)
  INTO v_paid_amount
  FROM payments
  WHERE order_id = COALESCE(NEW.order_id, OLD.order_id);

  SELECT total_amount INTO v_total_amount
  FROM orders
  WHERE id = COALESCE(NEW.order_id, OLD.order_id);

  IF v_paid_amount <= 0 THEN
    v_new_status := 'unpaid';
  ELSIF v_paid_amount >= v_total_amount THEN
    v_new_status := 'paid';
  ELSE
    v_new_status := 'partial';
  END IF;

  UPDATE orders
  SET
    paid_amount    = GREATEST(v_paid_amount, 0),
    payment_status = v_new_status,
    updated_at     = now()
  WHERE id = COALESCE(NEW.order_id, OLD.order_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
