-- Driver PWA additions
ALTER TABLE pickup_stops ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE pickup_stops ADD COLUMN IF NOT EXISTS bag_count integer;
ALTER TABLE pickup_stops ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE pickup_stops ADD COLUMN IF NOT EXISTS signature_url text;
