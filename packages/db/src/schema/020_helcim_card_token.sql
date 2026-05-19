-- Add Helcim card token column to customers for auto-billing
ALTER TABLE customers ADD COLUMN IF NOT EXISTS helcim_card_token text;
