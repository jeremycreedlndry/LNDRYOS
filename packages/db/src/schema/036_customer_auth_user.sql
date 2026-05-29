-- Link customers to Supabase auth users so the customer app can authenticate
ALTER TABLE customers ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_auth_user ON customers(auth_user_id) WHERE auth_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_tenant_auth_user ON customers(tenant_id, auth_user_id);
