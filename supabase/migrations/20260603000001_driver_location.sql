-- Driver real-time location for customer tracking page
ALTER TABLE pickup_stops
  ADD COLUMN IF NOT EXISTS driver_lat  double precision,
  ADD COLUMN IF NOT EXISTS driver_lng  double precision,
  ADD COLUMN IF NOT EXISTS driver_updated_at timestamptz;
