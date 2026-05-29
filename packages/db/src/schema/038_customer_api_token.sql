-- Per-tenant token used by the customer-facing app to identify which store it belongs to.
-- The app sends this as X-Tenant-Token header; the API looks up the tenant by it.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS customer_api_token text UNIQUE;

CREATE INDEX IF NOT EXISTS idx_tenants_customer_api_token ON tenants(customer_api_token)
  WHERE customer_api_token IS NOT NULL;
