-- Nayax terminal integration

-- Link each machine to its Nayax terminal device ID
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS nayax_device_id text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_equipment_nayax_device ON equipment(nayax_device_id) WHERE nayax_device_id IS NOT NULL;

-- Link each staff member to their Nayax pre-paid card ID
ALTER TABLE tenant_members ADD COLUMN IF NOT EXISTS nayax_card_id text;
CREATE INDEX IF NOT EXISTS idx_tenant_members_nayax_card ON tenant_members(nayax_card_id) WHERE nayax_card_id IS NOT NULL;

-- Pending taps: created by webhook, resolved when staff selects an order
CREATE TABLE pending_taps (
  id                uuid primary key default uuid_generate_v4(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  equipment_id      uuid references equipment(id) on delete set null,
  employee_user_id  uuid references auth.users(id) on delete set null,
  nayax_device_id   text not null,
  nayax_card_id     text not null,
  tapped_at         timestamptz not null,
  resolved          boolean not null default false,
  resolved_order_id uuid references orders(id) on delete set null,
  resolved_at       timestamptz,
  created_at        timestamptz not null default now()
);

CREATE INDEX idx_pending_taps_employee ON pending_taps(employee_user_id, resolved, created_at desc);
CREATE INDEX idx_pending_taps_tenant   ON pending_taps(tenant_id, resolved, created_at desc);

ALTER TABLE pending_taps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON pending_taps
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

-- Enable Supabase Realtime on this table so the browser gets live push
ALTER PUBLICATION supabase_realtime ADD TABLE pending_taps;
