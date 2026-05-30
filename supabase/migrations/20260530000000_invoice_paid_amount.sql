-- Add paid_amount_cents to track running balance on invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_amount_cents integer NOT NULL DEFAULT 0;

-- Expand status to include 'partial'
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('draft', 'unpaid', 'partial', 'paid', 'void'));
