-- Stacked (double-stack) dryers: each ADC DBL Nayax device controls two physical dryers
-- (top and bottom). This migration:
--   1. Renames existing dryer records to append "(Top)"
--   2. Creates matching "(Bottom)" records sharing the same nayax_device_id
--
-- Run ONCE on each Supabase project (local dev + staging).
-- Safe to re-run — the WHERE clause excludes already-renamed records.

-- Drop unique constraint on nayax_device_id so stacked dryers can share a device
DROP INDEX IF EXISTS idx_equipment_nayax_device;

-- Step 1: Rename existing dryer records to "(Top)" if not already suffixed
UPDATE equipment
SET name = name || ' (Top)'
WHERE type = 'dryer'
  AND name NOT LIKE '%(Top)%'
  AND name NOT LIKE '%(Bottom)%';

-- Step 2: Insert matching "(Bottom)" records for every renamed "(Top)" dryer
INSERT INTO equipment (tenant_id, name, type, nayax_device_id, sort_order, is_active, created_at)
SELECT
  tenant_id,
  replace(name, ' (Top)', ' (Bottom)'),
  type,
  nayax_device_id,
  sort_order + 1,         -- bottom sorts immediately after top
  is_active,
  now()
FROM equipment
WHERE type = 'dryer'
  AND name LIKE '%(Top)%'
  AND NOT EXISTS (
    -- Avoid duplicates if migration is re-run
    SELECT 1 FROM equipment e2
    WHERE e2.tenant_id = equipment.tenant_id
      AND e2.nayax_device_id = equipment.nayax_device_id
      AND e2.name LIKE '%(Bottom)%'
  );
