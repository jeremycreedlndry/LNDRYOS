-- Add cleaning status to order workflow
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'cleaning';

-- Equipment units per tenant
CREATE TABLE equipment (
  id         uuid primary key default uuid_generate_v4(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  type       text not null check (type in ('washer', 'dryer', 'folding')),
  name       text not null,
  is_active  boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
CREATE INDEX idx_equipment_tenant ON equipment(tenant_id, type);
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON equipment
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

-- Many-to-many: orders ↔ equipment
CREATE TABLE order_equipment_assignments (
  id           uuid primary key default uuid_generate_v4(),
  order_id     uuid not null references orders(id) on delete cascade,
  equipment_id uuid not null references equipment(id) on delete cascade,
  tenant_id    uuid not null references tenants(id) on delete cascade,
  assigned_at  timestamptz not null default now(),
  assigned_by  uuid references auth.users(id),
  UNIQUE(order_id, equipment_id)
);
CREATE INDEX idx_oea_order ON order_equipment_assignments(order_id);
ALTER TABLE order_equipment_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON order_equipment_assignments
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));
