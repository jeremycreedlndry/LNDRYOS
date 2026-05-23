-- Invoices: group unpaid orders for a customer or business account into a single bill

CREATE TABLE IF NOT EXISTS invoices (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL,
  invoice_number       text NOT NULL,   -- e.g. "INV-0001"
  recipient_type       text NOT NULL CHECK (recipient_type IN ('customer', 'business_account')),
  customer_id          uuid REFERENCES customers(id) ON DELETE SET NULL,
  business_account_id  uuid REFERENCES business_accounts(id) ON DELETE SET NULL,
  status               text NOT NULL DEFAULT 'unpaid'
                         CHECK (status IN ('draft', 'unpaid', 'paid', 'void')),
  issue_date           date NOT NULL DEFAULT CURRENT_DATE,
  due_date             date,
  subtotal_cents       bigint NOT NULL DEFAULT 0,
  tax_cents            bigint NOT NULL DEFAULT 0,
  total_cents          bigint NOT NULL DEFAULT 0,
  notes                text,
  sent_at              timestamptz,    -- last time emailed to recipient
  paid_at              timestamptz,
  created_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant       ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer     ON invoices(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_business     ON invoices(business_account_id) WHERE business_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_status       ON invoices(tenant_id, status);

-- Which orders are included in each invoice
CREATE TABLE IF NOT EXISTS invoice_orders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  order_id    uuid NOT NULL REFERENCES orders(id)   ON DELETE CASCADE,
  tenant_id   uuid NOT NULL,
  UNIQUE(invoice_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_invoice_orders_invoice ON invoice_orders(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_orders_order   ON invoice_orders(order_id);

-- RLS
ALTER TABLE invoices       ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON invoices
  USING (tenant_id = (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1));

CREATE POLICY "tenant_isolation" ON invoice_orders
  USING (tenant_id = (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1));
