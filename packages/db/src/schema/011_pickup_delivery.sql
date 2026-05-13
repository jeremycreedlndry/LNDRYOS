-- ─── Geocoordinates on customers ─────────────────────────────────────────────
ALTER TABLE customers ADD COLUMN IF NOT EXISTS lat  double precision;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS lng  double precision;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS geocoded_at timestamptz;

-- ─── Delivery zones (geo-fenced polygons drawn on a map) ──────────────────────
-- Coordinates stored as [[lng, lat], ...] GeoJSON-style JSONB array
CREATE TABLE delivery_zones (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null,
  color       text not null default '#3B82F6',
  coordinates jsonb not null default '[]',   -- [[lng,lat],...]  closed ring
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
CREATE INDEX idx_delivery_zones_tenant ON delivery_zones(tenant_id, sort_order);
ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON delivery_zones
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

-- ─── Pickup schedules (recurring or one-off per customer) ────────────────────
CREATE TYPE pickup_frequency AS ENUM ('once','weekly','biweekly','monthly');

CREATE TABLE pickup_schedules (
  id                  uuid primary key default uuid_generate_v4(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  customer_id         uuid not null references customers(id) on delete cascade,
  zone_id             uuid references delivery_zones(id) on delete set null,
  frequency           pickup_frequency not null default 'weekly',
  day_of_week         smallint,               -- 0=Sun … 6=Sat  (null for 'once')
  next_pickup_date    date,
  pickup_start        time,                   -- e.g. 09:00
  pickup_end          time,                   -- e.g. 12:00
  delivery_start      time,
  delivery_end        time,
  delivery_days_later smallint not null default 2,  -- deliver N days after pickup
  auto_create_order   boolean not null default true,
  notes               text,
  status              text not null default 'active'
    check (status in ('active','paused','cancelled')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
CREATE INDEX idx_pickup_schedules_tenant    ON pickup_schedules(tenant_id, status);
CREATE INDEX idx_pickup_schedules_customer  ON pickup_schedules(customer_id);
CREATE INDEX idx_pickup_schedules_zone      ON pickup_schedules(zone_id);
ALTER TABLE pickup_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON pickup_schedules
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

-- ─── Pickup stops (individual instances — pickup OR delivery) ─────────────────
CREATE TYPE stop_type   AS ENUM ('pickup','delivery');
CREATE TYPE stop_status AS ENUM ('pending','en_route','completed','failed','skipped');

CREATE TABLE pickup_stops (
  id               uuid primary key default uuid_generate_v4(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  schedule_id      uuid references pickup_schedules(id) on delete set null,
  customer_id      uuid not null references customers(id) on delete cascade,
  order_id         uuid references orders(id) on delete set null,
  zone_id          uuid references delivery_zones(id) on delete set null,
  driver_user_id   uuid references auth.users(id) on delete set null,
  type             stop_type   not null,
  status           stop_status not null default 'pending',
  scheduled_date   date not null,
  time_start       time,
  time_end         time,
  sequence_order   integer not null default 0,  -- within a zone/day route
  notes            text,
  driver_notes     text,
  completed_at     timestamptz,
  created_at       timestamptz not null default now()
);
CREATE INDEX idx_pickup_stops_tenant_date  ON pickup_stops(tenant_id, scheduled_date);
CREATE INDEX idx_pickup_stops_driver       ON pickup_stops(driver_user_id, scheduled_date);
CREATE INDEX idx_pickup_stops_customer     ON pickup_stops(customer_id);
CREATE INDEX idx_pickup_stops_order        ON pickup_stops(order_id);
ALTER TABLE pickup_stops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON pickup_stops
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));
