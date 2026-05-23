-- Fix payment_status enum: the DB used 'pending' as default but the app expects 'unpaid' and 'partial'
-- Note: enum value additions must be committed before they can be used in DML, so we run them first
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'unpaid';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'partial';
