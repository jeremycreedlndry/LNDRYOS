-- Stain reports — per-tenant, linked to LNDRYOS orders
CREATE TABLE stain_reports (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id           uuid        REFERENCES orders(id) ON DELETE SET NULL,
  order_number       text,
  customer_name      text        NOT NULL,
  order_summary      text,
  due_date           text,
  linen_item         text        NOT NULL,
  photo_url          text        NOT NULL,
  add_stain_remover  boolean     NOT NULL DEFAULT false,
  notes              text,
  status             text        NOT NULL DEFAULT 'active',  -- active | resolved
  created_by         uuid,
  created_by_name    text,
  resolved_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stain_reports_tenant   ON stain_reports(tenant_id, status);
CREATE INDEX idx_stain_reports_order    ON stain_reports(order_id);

ALTER TABLE stain_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view stain reports"
  ON stain_reports FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM tenant_members
    WHERE tenant_members.tenant_id = stain_reports.tenant_id
      AND tenant_members.user_id   = auth.uid()
      AND tenant_members.is_active = true
  ));

CREATE POLICY "Tenant members can insert stain reports"
  ON stain_reports FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM tenant_members
    WHERE tenant_members.tenant_id = stain_reports.tenant_id
      AND tenant_members.user_id   = auth.uid()
      AND tenant_members.is_active = true
  ));

CREATE POLICY "Tenant members can update stain reports"
  ON stain_reports FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM tenant_members
    WHERE tenant_members.tenant_id = stain_reports.tenant_id
      AND tenant_members.user_id   = auth.uid()
      AND tenant_members.is_active = true
  ));

-- Stain report shares — token-based public links
CREATE TABLE stain_report_shares (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token         uuid        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  order_id      uuid        REFERENCES orders(id) ON DELETE SET NULL,
  order_number  text,
  customer_name text        NOT NULL,
  due_date      text,
  order_summary text,
  items         jsonb       NOT NULL DEFAULT '[]',
  status        text        NOT NULL DEFAULT 'active',  -- active | archived
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stain_shares_token  ON stain_report_shares(token);
CREATE INDEX idx_stain_shares_tenant ON stain_report_shares(tenant_id);

ALTER TABLE stain_report_shares ENABLE ROW LEVEL SECURITY;

-- Public read via token (the token IS the secret)
CREATE POLICY "Anyone can view shares by token"
  ON stain_report_shares FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Tenant members can insert shares"
  ON stain_report_shares FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM tenant_members
    WHERE tenant_members.tenant_id = stain_report_shares.tenant_id
      AND tenant_members.user_id   = auth.uid()
      AND tenant_members.is_active = true
  ));

CREATE POLICY "Tenant members can update shares"
  ON stain_report_shares FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM tenant_members
    WHERE tenant_members.tenant_id = stain_report_shares.tenant_id
      AND tenant_members.user_id   = auth.uid()
      AND tenant_members.is_active = true
  ));

-- Storage bucket for stain photos (public read, auth write)
INSERT INTO storage.buckets (id, name, public)
VALUES ('stain-photos', 'stain-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Stain photos are publicly viewable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'stain-photos');

CREATE POLICY "Authenticated users can upload stain photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'stain-photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete stain photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'stain-photos' AND auth.uid() IS NOT NULL);
