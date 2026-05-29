-- Track where pickup stops originated (staff-created vs customer-app requests)
ALTER TABLE pickup_stops ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'staff'
  CHECK (source IN ('staff', 'customer_app'));

-- When null = not yet approved (customer_app stops only); not null = approved by staff
ALTER TABLE pickup_stops ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE pickup_stops ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pickup_stops_source ON pickup_stops(tenant_id, source, approved_at)
  WHERE source = 'customer_app';
