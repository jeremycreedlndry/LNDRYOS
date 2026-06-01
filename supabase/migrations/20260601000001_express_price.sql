-- Add express_price column to service_items for same-day turnaround pricing
ALTER TABLE service_items ADD COLUMN IF NOT EXISTS express_price integer;
