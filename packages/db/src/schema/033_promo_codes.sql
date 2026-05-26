-- Promo codes
CREATE TABLE promo_codes (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code                  text        NOT NULL,
  description           text,
  discount_type         text        NOT NULL CHECK (discount_type IN ('percent', 'flat')),
  discount_value        integer     NOT NULL CHECK (discount_value > 0),  -- percent 1-100 OR cents
  max_uses              integer,    -- null = unlimited total
  max_uses_per_customer integer,    -- null = unlimited per customer; 1 = once per customer
  expires_at            timestamptz,
  is_active             boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

-- Usage log
CREATE TABLE promo_code_uses (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id   uuid        NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  tenant_id       uuid        NOT NULL,
  customer_id     uuid        REFERENCES customers(id) ON DELETE SET NULL,
  order_id        uuid        REFERENCES orders(id) ON DELETE SET NULL,
  used_at         timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE promo_codes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_code_uses  ENABLE ROW LEVEL SECURITY;

CREATE POLICY promo_codes_tenant      ON promo_codes      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY promo_code_uses_tenant  ON promo_code_uses  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
