ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS notification_preference text NOT NULL DEFAULT 'sms_email'
  CHECK (notification_preference IN ('sms', 'email', 'sms_email', 'none'));
