-- ─── Inventory categories ─────────────────────────────────────────────────────
CREATE TABLE inventory_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       text NOT NULL,
  color      text NOT NULL DEFAULT '#6366f1',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_categories_tenant ON inventory_categories(tenant_id);

ALTER TABLE inventory_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON inventory_categories
  USING (tenant_id = (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1));

-- ─── Inventory items ───────────────────────────────────────────────────────────
CREATE TABLE inventory_items (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id          uuid REFERENCES inventory_categories(id) ON DELETE SET NULL,
  name                 text NOT NULL,
  unit                 text NOT NULL DEFAULT 'units',   -- bottles, bags, rolls, boxes, etc.
  current_stock        integer NOT NULL DEFAULT 0,
  low_stock_threshold  integer NOT NULL DEFAULT 2,
  notes                text,
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_items_tenant    ON inventory_items(tenant_id);
CREATE INDEX idx_inventory_items_category  ON inventory_items(category_id);

ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON inventory_items
  USING (tenant_id = (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1));

-- ─── Inventory transactions ────────────────────────────────────────────────────
CREATE TYPE inventory_tx_type AS ENUM ('restock', 'use', 'adjust');

CREATE TABLE inventory_transactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_id     uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  type        inventory_tx_type NOT NULL,
  quantity    integer NOT NULL,   -- always positive; direction inferred from type
  notes       text,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_tx_tenant  ON inventory_transactions(tenant_id);
CREATE INDEX idx_inventory_tx_item    ON inventory_transactions(item_id);
CREATE INDEX idx_inventory_tx_created ON inventory_transactions(created_at DESC);

ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON inventory_transactions
  USING (tenant_id = (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1));

-- ─── Trigger: keep current_stock in sync ──────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_inventory_stock()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE inventory_items
  SET
    current_stock = GREATEST(0,
      current_stock +
      CASE NEW.type
        WHEN 'restock' THEN  NEW.quantity
        WHEN 'use'     THEN -NEW.quantity
        WHEN 'adjust'  THEN  NEW.quantity   -- caller passes signed delta
      END
    ),
    updated_at = now()
  WHERE id = NEW.item_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_inventory_stock
AFTER INSERT ON inventory_transactions
FOR EACH ROW EXECUTE FUNCTION sync_inventory_stock();
