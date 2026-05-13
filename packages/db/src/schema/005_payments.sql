-- ─── Payments ─────────────────────────────────────────────────────────────────

create table payments (
  id                           uuid primary key default uuid_generate_v4(),
  tenant_id                    uuid not null references tenants(id) on delete cascade,
  order_id                     uuid not null references orders(id) on delete cascade,
  amount                       integer not null, -- cents
  method                       payment_method not null,
  status                       payment_status not null default 'pending',
  stripe_payment_intent_id     text unique,
  stripe_terminal_reader_id    text,
  cash_tendered                integer, -- cents, for cash payments
  change_due                   integer, -- cents
  processed_by                 uuid not null references auth.users(id),
  processed_at                 timestamptz not null default now(),
  created_at                   timestamptz not null default now()
);

create index idx_payments_order on payments(order_id);
create index idx_payments_tenant on payments(tenant_id, processed_at desc);
create index idx_payments_stripe_pi on payments(stripe_payment_intent_id);

alter table payments enable row level security;

create policy "tenant_isolation" on payments
  using (
    tenant_id in (
      select tenant_id from tenant_members where user_id = auth.uid()
    )
  );

-- ─── Update order paid_amount + status on payment insert ──────────────────────

create or replace function update_order_payment_status()
returns trigger language plpgsql security definer as $$
declare
  v_total_paid integer;
  v_order_total integer;
begin
  select coalesce(sum(amount), 0) into v_total_paid
  from payments
  where order_id = NEW.order_id and status = 'paid';

  select total_amount into v_order_total
  from orders where id = NEW.order_id;

  update orders
  set
    paid_amount = v_total_paid,
    payment_status = case
      when v_total_paid >= v_order_total then 'paid'::payment_status
      when v_total_paid > 0 then 'pending'::payment_status
      else 'pending'::payment_status
    end,
    updated_at = now()
  where id = NEW.order_id;

  return NEW;
end;
$$;

create trigger trg_update_order_payment
  after insert or update on payments
  for each row execute function update_order_payment_status();
