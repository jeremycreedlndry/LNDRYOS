-- Add waiver fields to order_lines
-- Used when a customer requests that we override care label instructions
-- (e.g. wet-wash a "dry clean only" item, or wash a delicate duvet)

ALTER TABLE order_lines
  ADD COLUMN IF NOT EXISTS waiver_required        boolean       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS waiver_text            text,
  ADD COLUMN IF NOT EXISTS waiver_token           text          UNIQUE,
  ADD COLUMN IF NOT EXISTS waiver_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS waiver_acknowledged_at  timestamptz,
  ADD COLUMN IF NOT EXISTS waiver_acknowledged_name text,
  ADD COLUMN IF NOT EXISTS waiver_acknowledged_ip   text;

-- Index so we can look up by token quickly on the public waiver page
CREATE INDEX IF NOT EXISTS order_lines_waiver_token_idx ON order_lines (waiver_token)
  WHERE waiver_token IS NOT NULL;
