-- Extend customers table with additional profile fields

alter table customers
  add column if not exists secondary_phone      text,
  add column if not exists address_street       text,
  add column if not exists address_apt          text,
  add column if not exists address_city         text,
  add column if not exists address_postal_code  text,
  add column if not exists driver_instructions  text,
  add column if not exists private_notes        text,
  add column if not exists payment_type         text not null default 'default',
  add column if not exists marketing_opt_in     boolean not null default false,
  add column if not exists invoice_style        text not null default 'store_default',
  add column if not exists discount_percent     integer not null default 0,
  add column if not exists tax_exempt           boolean not null default false,
  add column if not exists order_preferences    jsonb not null default '{}';
