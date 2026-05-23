-- Add missing payment method enum values
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'pay_on_collection';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'saved_card';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'invoice';
