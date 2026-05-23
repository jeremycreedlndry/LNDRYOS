-- Business accounts (property managers, companies, etc.)
-- A business account can have multiple customer accounts linked to it
-- and can be invoiced as a single entity covering all their customers' orders.

CREATE TABLE IF NOT EXISTS business_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  email         text,
  phone         text,
  address       text,
  city          text,
  province      text,
  postal_code   text,
  payment_terms_days int NOT NULL DEFAULT 30,
  notes         text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_accounts_tenant ON business_accounts(tenant_id);

-- Link customers to a business account (nullable — most customers are not linked to a business)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS business_account_id uuid REFERENCES business_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_customers_business_account ON customers(business_account_id) WHERE business_account_id IS NOT NULL;

-- RLS
ALTER TABLE business_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON business_accounts
  USING (tenant_id = (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1));
