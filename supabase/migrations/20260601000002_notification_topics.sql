-- Per-customer notification topic preferences (JSONB, all on by default)
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS notification_topics jsonb NOT NULL DEFAULT '{"order_confirmed":true,"order_ready":true,"pickup_reminder":true,"billing":true}';
