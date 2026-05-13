-- ─── Orders ───────────────────────────────────────────────────────────────────

create table orders (
  id               uuid primary key default uuid_generate_v4(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  order_number     text not null,
  customer_id      uuid references customers(id) on delete set null,
  customer_name    text, -- denormalized for walk-ins without a customer record
  status           order_status not null default 'pending',
  payment_status   payment_status not null default 'pending',
  subtotal         integer not null default 0, -- cents
  tax_amount       integer not null default 0,
  discount_amount  integer not null default 0,
  total_amount     integer not null default 0,
  paid_amount      integer not null default 0,
  notes            text,
  due_date         date,
  ready_at         timestamptz,
  picked_up_at     timestamptz,
  created_by       uuid not null references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique(tenant_id, order_number)
);

create index idx_orders_tenant_status on orders(tenant_id, status, created_at desc);
create index idx_orders_customer on orders(tenant_id, customer_id);
create index idx_orders_number on orders(tenant_id, order_number);

-- Auto-generate order numbers per tenant: LP-000001, LP-000002, ...
create sequence if not exists order_number_seq;

create or replace function generate_order_number(p_tenant_id uuid)
returns text language plpgsql as $$
declare
  v_count bigint;
begin
  select count(*) + 1 into v_count from orders where tenant_id = p_tenant_id;
  return 'LP-' || lpad(v_count::text, 6, '0');
end;
$$;

-- ─── Order Lines ──────────────────────────────────────────────────────────────

create table order_lines (
  id               uuid primary key default uuid_generate_v4(),
  order_id         uuid not null references orders(id) on delete cascade,
  tenant_id        uuid not null references tenants(id) on delete cascade,
  service_item_id  uuid references service_items(id) on delete set null,
  name             text not null,
  category         item_category not null,
  quantity         numeric(10,3) not null default 1,
  unit_price       integer not null, -- cents
  line_total       integer not null, -- cents
  notes            text,
  tag_number       text
);

create index idx_order_lines_order on order_lines(order_id);
create index idx_order_lines_tenant on order_lines(tenant_id);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table orders enable row level security;
alter table order_lines enable row level security;

create policy "tenant_isolation" on orders
  using (
    tenant_id in (
      select tenant_id from tenant_members where user_id = auth.uid()
    )
  );

create policy "tenant_isolation" on order_lines
  using (
    tenant_id in (
      select tenant_id from tenant_members where user_id = auth.uid()
    )
  );
