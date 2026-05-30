-- Invoice payment history — one row per payment recorded against an invoice
CREATE TABLE IF NOT EXISTS invoice_payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id    uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount_cents  integer NOT NULL CHECK (amount_cents > 0),
  method        text NOT NULL,
  notes         text,
  recorded_by   uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_payments_invoice_id_idx ON invoice_payments(invoice_id);
CREATE INDEX IF NOT EXISTS invoice_payments_tenant_id_idx  ON invoice_payments(tenant_id);
