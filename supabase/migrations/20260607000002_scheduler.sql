-- Employee shifts — tenant-scoped, referenced by tenant_members.user_id
CREATE TABLE employee_shifts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL,   -- tenant_members.user_id (auth.users)
  shift_date  date        NOT NULL,
  start_time  time        NOT NULL,
  end_time    time        NOT NULL,
  notes       text,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_employee_shifts_tenant_date ON employee_shifts(tenant_id, shift_date);
CREATE INDEX idx_employee_shifts_user        ON employee_shifts(tenant_id, user_id);

ALTER TABLE employee_shifts ENABLE ROW LEVEL SECURITY;

-- All active tenant members can read shifts
CREATE POLICY "Tenant members can view shifts"
  ON employee_shifts FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM tenant_members
    WHERE tenant_members.tenant_id = employee_shifts.tenant_id
      AND tenant_members.user_id   = auth.uid()
      AND tenant_members.is_active = true
  ));

-- Only managers/owners can insert/update/delete
CREATE POLICY "Managers can insert shifts"
  ON employee_shifts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM tenant_members
    WHERE tenant_members.tenant_id = employee_shifts.tenant_id
      AND tenant_members.user_id   = auth.uid()
      AND tenant_members.is_active = true
      AND tenant_members.role IN ('owner', 'manager')
  ));

CREATE POLICY "Managers can update shifts"
  ON employee_shifts FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM tenant_members
    WHERE tenant_members.tenant_id = employee_shifts.tenant_id
      AND tenant_members.user_id   = auth.uid()
      AND tenant_members.is_active = true
      AND tenant_members.role IN ('owner', 'manager')
  ));

CREATE POLICY "Managers can delete shifts"
  ON employee_shifts FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM tenant_members
    WHERE tenant_members.tenant_id = employee_shifts.tenant_id
      AND tenant_members.user_id   = auth.uid()
      AND tenant_members.is_active = true
      AND tenant_members.role IN ('owner', 'manager')
  ));

-- Schedule tokens — one per user per tenant, used for calendar feed
CREATE TABLE schedule_tokens (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL,
  token      uuid        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

CREATE INDEX idx_schedule_tokens_token ON schedule_tokens(token);

ALTER TABLE schedule_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own token"
  ON schedule_tokens FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own token"
  ON schedule_tokens FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own token"
  ON schedule_tokens FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
