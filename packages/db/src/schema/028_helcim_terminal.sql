-- Add Helcim transaction tracking to payments
ALTER TABLE payments ADD COLUMN IF NOT EXISTS helcim_transaction_id text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS helcim_card_token text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS card_last4 text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS card_brand text;

-- Add Helcim terminal ID to tenants (set via Settings > Integrations)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS helcim_terminal_id text;

-- Index for polling
CREATE INDEX IF NOT EXISTS idx_payments_helcim_txn ON payments(helcim_transaction_id) WHERE helcim_transaction_id IS NOT NULL;
