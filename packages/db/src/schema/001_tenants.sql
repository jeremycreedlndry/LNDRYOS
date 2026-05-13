-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── Enums ────────────────────────────────────────────────────────────────────

create type tenant_status as enum ('active', 'suspended', 'cancelled');
create type subscription_plan as enum ('starter', 'professional', 'enterprise');
create type order_status as enum (
  'pending', 'in_progress', 'ready', 'picked_up', 'delivered', 'cancelled'
);
create type payment_status as enum ('pending', 'paid', 'refunded', 'failed');
create type payment_method as enum (
  'card_present', 'card_online', 'cash', 'account_credit'
);
create type item_category as enum (
  'wash_fold', 'dry_clean', 'press_only', 'alterations', 'other'
);
create type staff_role as enum ('owner', 'manager', 'staff');

-- ─── Tenants ──────────────────────────────────────────────────────────────────

create table tenants (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  slug            text not null unique,
  status          tenant_status not null default 'active',
  plan            subscription_plan not null default 'starter',
  stripe_customer_id         text unique,
  stripe_subscription_id     text unique,
  stripe_terminal_location_id text,
  currency        text not null default 'usd',
  timezone        text not null default 'America/New_York',
  logo_url        text,
  address         jsonb,
  settings        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_tenants_slug on tenants(slug);
create index idx_tenants_stripe_customer on tenants(stripe_customer_id);

-- ─── Tenant Members ───────────────────────────────────────────────────────────

create table tenant_members (
  id           uuid primary key default uuid_generate_v4(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         staff_role not null default 'staff',
  display_name text not null,
  email        text not null,
  created_at   timestamptz not null default now(),
  unique(tenant_id, user_id)
);

create index idx_tenant_members_user on tenant_members(user_id);
create index idx_tenant_members_tenant on tenant_members(tenant_id);
