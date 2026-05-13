create table if not exists order_notes (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  order_id    uuid not null references orders(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_order_notes_order on order_notes(order_id, created_at desc);

alter table order_notes enable row level security;

create policy "tenant members can manage order notes"
  on order_notes for all
  using (
    exists (
      select 1 from tenant_members
      where tenant_members.tenant_id = order_notes.tenant_id
        and tenant_members.user_id = auth.uid()
    )
  );
