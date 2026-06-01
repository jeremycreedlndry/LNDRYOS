-- Staff clock-in / clock-out time tracking
CREATE TABLE IF NOT EXISTS time_entries (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clocked_in_at   timestamptz NOT NULL DEFAULT now(),
  clocked_out_at  timestamptz,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_tenant_user
  ON time_entries(tenant_id, user_id, clocked_in_at DESC);

CREATE INDEX IF NOT EXISTS idx_time_entries_open
  ON time_entries(tenant_id, user_id)
  WHERE clocked_out_at IS NULL;

ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "tenant_isolation" ON time_entries
    USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
