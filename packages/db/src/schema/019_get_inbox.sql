-- Inbox RPC: one row per customer with at least one message,
-- sorted by most-recent message, with unread count.
create or replace function get_inbox(p_tenant_id uuid)
returns table (
  customer_id    uuid,
  first_name     text,
  last_name      text,
  phone          text,
  last_body      text,
  last_channel   text,
  last_direction text,
  last_at        timestamptz,
  unread_count   bigint
)
language sql
security definer
stable
as $$
  select
    c.id                                                                       as customer_id,
    c.first_name,
    c.last_name,
    c.phone,
    latest.body                                                                as last_body,
    latest.channel                                                             as last_channel,
    latest.direction                                                           as last_direction,
    latest.created_at                                                          as last_at,
    count(*) filter (
      where m2.direction = 'inbound' and m2.read_at is null
    )                                                                          as unread_count
  from customers c
  join lateral (
    select body, channel, direction, created_at
    from   messages
    where  tenant_id   = p_tenant_id
      and  customer_id = c.id
    order  by created_at desc
    limit  1
  ) latest on true
  left join messages m2
         on m2.tenant_id   = p_tenant_id
        and m2.customer_id = c.id
  where c.tenant_id = p_tenant_id
  group by c.id, c.first_name, c.last_name, c.phone,
           latest.body, latest.channel, latest.direction, latest.created_at
  order by latest.created_at desc;
$$;
