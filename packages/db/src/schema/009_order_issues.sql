-- Issue categories per tenant (extensible list, seeded with defaults on first use)
CREATE TABLE issue_categories (
  id         uuid primary key default uuid_generate_v4(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  label      text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(tenant_id, label)
);
CREATE INDEX idx_issue_categories_tenant ON issue_categories(tenant_id, sort_order);
ALTER TABLE issue_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON issue_categories
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

-- Order issues (flagged items with photos)
CREATE TABLE order_issues (
  id           uuid primary key default uuid_generate_v4(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  order_id     uuid not null references orders(id) on delete cascade,
  photo_url    text not null,
  storage_path text not null,
  category     text not null,
  note         text,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);
CREATE INDEX idx_order_issues_order ON order_issues(order_id);
CREATE INDEX idx_order_issues_tenant ON order_issues(tenant_id, created_at desc);
ALTER TABLE order_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON order_issues
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

-- Storage bucket for order issue photos (public read, authenticated write)
-- Run this once in Supabase or via the Storage dashboard
INSERT INTO storage.buckets (id, name, public)
VALUES ('order-issues', 'order-issues', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their tenant folder
CREATE POLICY "authenticated upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'order-issues');

CREATE POLICY "public read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'order-issues');

CREATE POLICY "authenticated delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'order-issues');
