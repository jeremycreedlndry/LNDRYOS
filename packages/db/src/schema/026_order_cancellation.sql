-- Track when/why/who cancelled an order (soft-delete, keeps record)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cancelled_at         timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason  text,
  ADD COLUMN IF NOT EXISTS cancelled_by         uuid references auth.users(id) on delete set null;

-- Add delete_orders permission flag to the existing permissions schema doc (informational)
-- Stored in tenant_members.permissions JSONB as { "delete_orders": true }
-- owners and managers always have this right; staff only if explicitly granted
