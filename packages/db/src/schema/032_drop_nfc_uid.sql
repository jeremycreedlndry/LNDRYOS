-- card_unique_identifier IS the NFC tap ID (e.g. "1162872302") — it's what
-- the card broadcasts via NFC and what Nayax uses for API calls (/credit/add etc).
-- The nfc_uid column added in 031 is redundant — drop it.

DROP INDEX IF EXISTS idx_gift_cards_nfc_uid;
DROP INDEX IF EXISTS idx_gift_cards_nfc;
ALTER TABLE customer_gift_cards DROP COLUMN IF EXISTS nfc_uid;

-- Index card_unique_identifier so webhook lookups are fast
CREATE INDEX IF NOT EXISTS idx_gift_cards_card_uid
  ON customer_gift_cards(tenant_id, card_unique_identifier);
