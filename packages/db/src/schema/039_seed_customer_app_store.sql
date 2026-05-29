-- Seed wash_fold tiers and preference options for the customer app.
-- Run once in Supabase SQL editor.
-- Tenant: b6b27886-565a-425e-93ce-c0e165aa8ac6

do $$
declare
  tid uuid := 'b6b27886-565a-425e-93ce-c0e165aa8ac6';
begin

  -- ── Wash & Fold tiers ──────────────────────────────────────────────────────
  -- Delete existing wash_fold items so we replace with proper tiers
  delete from service_items where tenant_id = tid and category = 'wash_fold';

  insert into service_items (tenant_id, name, description, category, unit_price, unit_label, is_active, sort_order, preference_groups)
  values
    (tid, 'Basic',
     'Our basic Wash & Fold service. 10 lb minimum.',
     'wash_fold', 225, 'lb', true, 1,
     '["wash_temperature","dryer"]'),
    (tid, 'Standard',
     'Our most popular Wash & Fold service. Includes premium detergent and fabric softener options.',
     'wash_fold', 250, 'lb', true, 2,
     '["wash_temperature","detergent_type","fabric_softener","dryer_sheets","bleach","dryer"]'),
    (tid, 'Premium',
     'Full-service Wash & Fold with all preference options and priority handling.',
     'wash_fold', 299, 'lb', true, 3,
     '["wash_temperature","detergent_type","fabric_softener","dryer_sheets","bleach","dryer"]');

  -- ── Preference options + time slots in tenant settings ────────────────────
  update tenants
  set settings = settings
    || jsonb_build_object(
        'time_slots', jsonb_build_array(
          '8:00 AM - 10:00 AM',
          '10:00 AM - 12:00 PM',
          '12:00 PM - 2:00 PM',
          '2:00 PM - 4:00 PM',
          '4:00 PM - 6:00 PM'
        ),
        'order_preference_options', jsonb_build_object(
          'wash_temperature', jsonb_build_array('Cold','Warm','Hot'),
          'detergent_type',   jsonb_build_array('Tide','Gain','Hypoallergenic','Fragrance Free'),
          'fabric_softener',  jsonb_build_array('Downy','Snuggle','None'),
          'dryer_sheets',     jsonb_build_array('Bounce','Snuggle','Dryer Balls','None'),
          'bleach',           jsonb_build_array('None','Color Safe','Regular'),
          'dryer',            jsonb_build_array('Low Heat','Medium Heat','High Heat','Hang Dry')
        )
      )
  where id = tid;

end $$;
