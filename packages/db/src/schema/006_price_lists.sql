-- ─── Price Lists ──────────────────────────────────────────────────────────────

create table price_lists (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Only one default per tenant
create unique index idx_price_lists_default on price_lists(tenant_id) where is_default = true;
create index idx_price_lists_tenant on price_lists(tenant_id);

-- Per-item price overrides for a given price list
create table price_list_items (
  id              uuid primary key default uuid_generate_v4(),
  price_list_id   uuid not null references price_lists(id) on delete cascade,
  service_item_id uuid not null references service_items(id) on delete cascade,
  unit_price      integer not null, -- cents
  created_at      timestamptz not null default now(),
  unique(price_list_id, service_item_id)
);

create index idx_price_list_items_list on price_list_items(price_list_id);

-- Customers can be assigned to a price list (null = default)
alter table customers add column if not exists price_list_id uuid references price_lists(id) on delete set null;

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table price_lists enable row level security;
create policy "tenant_isolation" on price_lists
  using (tenant_id in (select tenant_id from tenant_members where user_id = auth.uid()));

alter table price_list_items enable row level security;
create policy "tenant_isolation" on price_list_items
  using (price_list_id in (
    select id from price_lists where tenant_id in (
      select tenant_id from tenant_members where user_id = auth.uid()
    )
  ));

-- ─── Seed default price list for existing tenants ─────────────────────────────

do $$
declare v_tenant record;
begin
  for v_tenant in select id from tenants loop
    insert into price_lists (tenant_id, name, is_default)
    values (v_tenant.id, 'Default', true)
    on conflict do nothing;
  end loop;
end;
$$;
