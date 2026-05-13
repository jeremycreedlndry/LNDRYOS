-- ─── Service Catalog ──────────────────────────────────────────────────────────

create table service_items (
  id           uuid primary key default uuid_generate_v4(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  name         text not null,
  description  text,
  category     item_category not null,
  unit_price   integer not null, -- in cents
  unit_label   text not null default 'item',
  is_active    boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create index idx_service_items_tenant on service_items(tenant_id, is_active, sort_order);

alter table service_items enable row level security;

create policy "tenant_isolation" on service_items
  using (
    tenant_id in (
      select tenant_id from tenant_members where user_id = auth.uid()
    )
  );

-- ─── Seed default catalog for new tenants ─────────────────────────────────────
-- Called via a Postgres function after tenant creation

create or replace function seed_default_catalog(p_tenant_id uuid)
returns void language plpgsql as $$
begin
  insert into service_items (tenant_id, name, category, unit_price, unit_label, sort_order) values
    (p_tenant_id, 'Wash & Fold',          'wash_fold',   200,  'lb',   1),
    (p_tenant_id, 'Wash & Press Shirt',   'dry_clean',   499,  'item', 2),
    (p_tenant_id, 'Dry Clean Jacket',     'dry_clean',   1499, 'item', 3),
    (p_tenant_id, 'Dry Clean Pants',      'dry_clean',   999,  'item', 4),
    (p_tenant_id, 'Dry Clean Dress',      'dry_clean',   1799, 'item', 5),
    (p_tenant_id, 'Press Only Shirt',     'press_only',  299,  'item', 6),
    (p_tenant_id, 'Press Only Pants',     'press_only',  299,  'item', 7),
    (p_tenant_id, 'Alterations - Hem',    'alterations', 1200, 'item', 8),
    (p_tenant_id, 'Alterations - Zipper', 'alterations', 1500, 'item', 9);
end;
$$;
