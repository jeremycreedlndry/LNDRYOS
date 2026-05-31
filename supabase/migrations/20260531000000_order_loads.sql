-- Per-load tracking for orders split across multiple machines
-- One row per load; loads are created when an order is first assigned to washers.
-- Each load progresses independently: washing → drying → folding → ready
CREATE TABLE IF NOT EXISTS order_loads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  load_number      integer NOT NULL,
  stage            text NOT NULL DEFAULT 'washing'
    CHECK (stage IN ('washing', 'drying', 'folding', 'ready')),
  equipment_id     uuid REFERENCES equipment(id) ON DELETE SET NULL,
  duration_minutes integer,
  temperature      text,
  assigned_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, load_number)
);

CREATE INDEX IF NOT EXISTS idx_order_loads_order     ON order_loads(order_id);
CREATE INDEX IF NOT EXISTS idx_order_loads_tenant    ON order_loads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_order_loads_equipment ON order_loads(equipment_id);

ALTER TABLE order_loads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON order_loads
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));
