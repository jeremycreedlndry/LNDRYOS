-- ─── Extend tenant_members with staff profile fields ─────────────────────────
ALTER TABLE tenant_members
  ADD COLUMN IF NOT EXISTS phone             text,
  ADD COLUMN IF NOT EXISTS hourly_rate_cents integer,
  ADD COLUMN IF NOT EXISTS permissions       jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_active         boolean NOT NULL DEFAULT true;

-- ─── Time entries (clock in / clock out) ─────────────────────────────────────
CREATE TABLE time_entries (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  clocked_in_at   timestamptz not null default now(),
  clocked_out_at  timestamptz,
  notes           text,
  created_at      timestamptz not null default now()
);

CREATE INDEX idx_time_entries_tenant_user ON time_entries(tenant_id, user_id, clocked_in_at DESC);
CREATE INDEX idx_time_entries_open        ON time_entries(tenant_id, user_id) WHERE clocked_out_at IS NULL;

ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON time_entries
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));
