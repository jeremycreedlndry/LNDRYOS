-- Linen presets — tenant-scoped list of bag-out label item types
-- (e.g. "King Sheet", "Bath Towel", "Queen Duvet")

CREATE TABLE linen_presets (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  label      text        NOT NULL,
  sort_order int         NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, label)
);

ALTER TABLE linen_presets ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_linen_presets_tenant ON linen_presets(tenant_id);

-- Tenant members can read and manage their own presets
CREATE POLICY "Tenant members can view linen presets"
  ON linen_presets FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = linen_presets.tenant_id
        AND tenant_members.user_id = auth.uid()
        AND tenant_members.is_active = true
    )
  );

CREATE POLICY "Tenant members can insert linen presets"
  ON linen_presets FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = linen_presets.tenant_id
        AND tenant_members.user_id = auth.uid()
        AND tenant_members.is_active = true
    )
  );

CREATE POLICY "Tenant members can delete linen presets"
  ON linen_presets FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = linen_presets.tenant_id
        AND tenant_members.user_id = auth.uid()
        AND tenant_members.is_active = true
    )
  );

-- Seed a few sensible defaults — these only insert if the tenant already exists.
-- In practice, the page seeds on first save. This is a no-op for new installs.
-- (Remove or adjust for your specific tenants as needed.)
