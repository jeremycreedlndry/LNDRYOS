-- Prepaid (gift) cards — our DB is the source of truth for balance
-- Nayax is kept in sync as a mirror (fire-and-forget on each transaction)

-- Add gift_card to the payment_method enum
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'gift_card';

-- Card registry: one row per physical card
CREATE TABLE IF NOT EXISTS customer_gift_cards (
  id                     uuid primary key default uuid_generate_v4(),
  tenant_id              uuid not null references tenants(id) on delete cascade,
  customer_id            uuid references customers(id) on delete set null,
  card_display_number    text not null,
  card_unique_identifier text not null,        -- Nayax GUID (used for API calls)
  card_id                integer,               -- Nayax integer CardID
  balance_cents          integer not null default 0,
  status                 text not null default 'active',  -- active | inactive | lost
  notes                  text,
  imported_at            timestamptz,           -- set when imported from Nayax admin
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  UNIQUE (tenant_id, card_display_number)
);

CREATE INDEX IF NOT EXISTS idx_gift_cards_tenant    ON customer_gift_cards(tenant_id, created_at desc);
CREATE INDEX IF NOT EXISTS idx_gift_cards_customer  ON customer_gift_cards(customer_id);

ALTER TABLE customer_gift_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON customer_gift_cards
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

-- Ledger: every debit/credit transaction against a card
CREATE TABLE IF NOT EXISTS gift_card_transactions (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  card_id         uuid not null references customer_gift_cards(id) on delete cascade,
  order_id        uuid references orders(id) on delete set null,
  type            text not null,    -- 'charge' | 'reload' | 'refund' | 'adjustment'
  amount_cents    integer not null, -- positive = credit added, negative = balance deducted
  balance_after   integer not null, -- running balance after this transaction
  notes           text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_gct_card   ON gift_card_transactions(card_id, created_at desc);
CREATE INDEX IF NOT EXISTS idx_gct_tenant ON gift_card_transactions(tenant_id, created_at desc);

ALTER TABLE gift_card_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON gift_card_transactions
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));
