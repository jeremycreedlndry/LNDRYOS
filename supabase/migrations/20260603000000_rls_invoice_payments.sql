-- Enable RLS on invoice_payments (was missing, flagged as critical security issue)
ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON invoice_payments
  USING (
    invoice_id IN (
      SELECT id FROM invoices
      WHERE tenant_id IN (
        SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
      )
    )
  );
