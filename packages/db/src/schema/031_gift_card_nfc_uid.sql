-- Add NFC UID to customer gift cards
-- This is the raw ID broadcast by the card's NFC chip (CardId from Nayax webhook).
-- It is NOT the display number (visible on card face) and NOT the CardUniqueIdentifier
-- (Nayax GUID used for Lynx API calls). This is the field we match against when a
-- customer taps their card on a reader.

ALTER TABLE customer_gift_cards
  ADD COLUMN IF NOT EXISTS nfc_uid text;

-- Must be unique per tenant (one card per tap ID)
CREATE UNIQUE INDEX IF NOT EXISTS idx_gift_cards_nfc_uid
  ON customer_gift_cards(tenant_id, nfc_uid)
  WHERE nfc_uid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gift_cards_nfc
  ON customer_gift_cards(nfc_uid)
  WHERE nfc_uid IS NOT NULL;

-- Link pending_taps to gift cards so POS knows it was a customer card tap
ALTER TABLE pending_taps
  ADD COLUMN IF NOT EXISTS gift_card_id uuid REFERENCES customer_gift_cards(id) ON DELETE SET NULL;
