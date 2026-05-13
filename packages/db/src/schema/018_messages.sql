create table if not exists messages (
  id           uuid primary key default uuid_generate_v4(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  customer_id  uuid references customers(id) on delete set null,
  direction    text not null check (direction in ('inbound', 'outbound')),
  channel      text not null check (channel in ('sms', 'email')),
  body         text not null,
  subject      text,                          -- email subject line
  from_address text,                          -- phone or email address
  to_address   text,
  staff_user_id uuid references auth.users(id) on delete set null,  -- null = automated
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists idx_messages_tenant_customer on messages(tenant_id, customer_id, created_at desc);
create index if not exists idx_messages_tenant_unread   on messages(tenant_id, read_at, direction) where read_at is null;

alter table messages enable row level security;

create policy "tenant members can manage messages"
  on messages for all
  using (
    exists (
      select 1 from tenant_members
      where tenant_members.tenant_id = messages.tenant_id
        and tenant_members.user_id = auth.uid()
    )
  );

-- Enable Realtime so new inbound messages push to the inbox immediately
alter publication supabase_realtime add table messages;
