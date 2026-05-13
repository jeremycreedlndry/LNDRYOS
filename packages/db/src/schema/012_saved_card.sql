ALTER TABLE customers ADD COLUMN IF NOT EXISTS saved_card_last4 text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS saved_card_brand text;
