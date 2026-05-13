-- ─── Customers ────────────────────────────────────────────────────────────────

create table customers (
  id                  uuid primary key default uuid_generate_v4(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  first_name          text not null,
  last_name           text not null,
  email               text,
  phone               text,
  notes               text,
  account_balance     integer not null default 0, -- in cents
  stripe_customer_id  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_customers_tenant on customers(tenant_id);
create index idx_customers_phone on customers(tenant_id, phone);
create index idx_customers_email on customers(tenant_id, email);
create index idx_customers_name on customers(tenant_id, last_name, first_name);

-- Full-text search on customer name + phone
create index idx_customers_fts on customers using gin(
  to_tsvector('english', coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(phone, '') || ' ' || coalesce(email, ''))
);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table customers enable row level security;

create policy "tenant_isolation" on customers
  using (
    tenant_id in (
      select tenant_id from tenant_members where user_id = auth.uid()
    )
  );
