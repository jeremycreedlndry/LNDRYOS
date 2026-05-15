/**
 * Seed test data for The LNDRY Co staging environment.
 * Creates customers, orders, pickup stops, and recurring schedules.
 *
 * Run: node scripts/seed-test-data.mjs
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = 'https://uwugotsowhnnygtaeaqb.supabase.co'
const SERVICE_KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3dWdvdHNvd2hubnlndGFlYXFiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzg2NjM2NCwiZXhwIjoyMDkzNDQyMzY0fQ.QXTpcfw4SfBzGFYvJbuUIZqiYjYYXgB9gy7MEEDpGCs'

const TENANT_ID     = 'b6b27886-565a-425e-93ce-c0e165aa8ac6'
const STAFF_USER_ID = 'ccea652a-100d-4911-9bce-afeaae5c4a2f'
const ZONE_OWEN     = 'c27ccce2-82f8-4042-bdcf-7c0fc9a77116'
const ZONE_MEAFORD  = 'da24bd71-1d6a-4fd2-a223-c1f08a4ce7c7'

// Service item IDs
const SVC_BASIC    = 'd786954a-f475-433f-a829-d845aeee727e'   // 225¢/lb
const SVC_STANDARD = '0813ec31-cd51-456d-8cb6-76279937b273'  // 250¢/lb
const SVC_PREMIUM  = '726b243f-80bb-46ed-afd1-c5243f45078b'  // 300¢/lb

const sb = createClient(SUPABASE_URL, SERVICE_KEY)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoDate(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().split('T')[0]
}

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

let orderSeq = 21  // last was ORD-00021

function nextOrderNumber() {
  return `ORD-${String(++orderSeq).padStart(5, '0')}`
}

async function insert(table, rows) {
  const { data, error } = await sb.from(table).insert(rows).select('id')
  if (error) throw new Error(`Insert ${table}: ${error.message}`)
  return data
}

// ─── Customers ────────────────────────────────────────────────────────────────

const CUSTOMERS = [
  // Owen Sound
  { first_name: 'Sarah',    last_name: 'Mitchell',  phone: '+17059999101', email: 'sarah.mitchell@example.com',  address_street: '900 2nd Ave E',      address_city: 'Owen Sound', address_postal_code: 'N4K 2H3', zone: ZONE_OWEN,    lat: 44.5679, lng: -80.9387, driver_instructions: 'Side door on left' },
  { first_name: 'Dan',      last_name: 'Kowalski',  phone: '+17059999102', email: 'dan.kowalski@example.com',    address_street: '1450 10th St W',     address_city: 'Owen Sound', address_postal_code: 'N4K 3R6', zone: ZONE_OWEN,    lat: 44.5703, lng: -80.9551, driver_instructions: null },
  { first_name: 'Priya',    last_name: 'Sharma',    phone: '+17059999103', email: 'priya.sharma@example.com',    address_street: '567 4th Ave W',      address_city: 'Owen Sound', address_postal_code: 'N4K 4L5', zone: ZONE_OWEN,    lat: 44.5691, lng: -80.9469, driver_instructions: 'Buzz unit 3' },
  { first_name: 'Marcus',   last_name: 'Thompson',  phone: '+17059999104', email: 'marcus.t@example.com',        address_street: '234 8th St E',       address_city: 'Owen Sound', address_postal_code: 'N4K 1L4', zone: ZONE_OWEN,    lat: 44.5660, lng: -80.9312, driver_instructions: null },
  { first_name: 'Linda',    last_name: 'Okafor',    phone: '+17059999105', email: 'linda.o@example.com',         address_street: '789 15th St E',      address_city: 'Owen Sound', address_postal_code: 'N4K 1T9', zone: ZONE_OWEN,    lat: 44.5725, lng: -80.9278, driver_instructions: 'Leave at porch' },
  { first_name: 'James',    last_name: 'Reilly',    phone: '+17059999106', email: 'james.reilly@example.com',    address_street: '1100 3rd Ave E',     address_city: 'Owen Sound', address_postal_code: 'N4K 2P7', zone: ZONE_OWEN,    lat: 44.5685, lng: -80.9356, driver_instructions: null },
  { first_name: 'Amber',    last_name: 'Nguyen',    phone: '+17059999107', email: 'amber.n@example.com',         address_street: '450 6th Ave E',      address_city: 'Owen Sound', address_postal_code: 'N4K 2R2', zone: ZONE_OWEN,    lat: 44.5670, lng: -80.9388, driver_instructions: 'Call on arrival' },
  { first_name: 'David',    last_name: 'Brennan',   phone: '+17059999108', email: 'd.brennan@example.com',       address_street: '33 McNab St N',      address_city: 'Owen Sound', address_postal_code: 'N4K 1J6', zone: ZONE_OWEN,    lat: 44.5648, lng: -80.9403, driver_instructions: null },
  { first_name: 'Chloe',    last_name: 'Arsenault', phone: '+17059999109', email: 'chloe.a@example.com',         address_street: '650 9th St E',       address_city: 'Owen Sound', address_postal_code: 'N4K 1P2', zone: ZONE_OWEN,    lat: 44.5712, lng: -80.9318, driver_instructions: 'Apt 2B' },
  { first_name: 'Tyler',    last_name: 'Gross',     phone: '+17059999110', email: 'tyler.gross@example.com',     address_street: '1200 7th Ave E',     address_city: 'Owen Sound', address_postal_code: 'N4K 2X4', zone: ZONE_OWEN,    lat: 44.5698, lng: -80.9298, driver_instructions: null },

  // Meaford / Thornbury
  { first_name: 'Helen',    last_name: 'Forsythe',  phone: '+17059999201', email: 'helen.f@example.com',         address_street: '45 Boucher St E',    address_city: 'Meaford',    address_postal_code: 'N4L 1B7', zone: ZONE_MEAFORD, lat: 44.6014, lng: -80.5875, driver_instructions: null },
  { first_name: 'Connor',   last_name: 'Walsh',     phone: '+17059999202', email: 'c.walsh@example.com',         address_street: '223 Sykes St N',     address_city: 'Meaford',    address_postal_code: 'N4L 1V4', zone: ZONE_MEAFORD, lat: 44.5997, lng: -80.5901, driver_instructions: 'Back entrance' },
  { first_name: 'Natalie',  last_name: 'Dubois',    phone: '+17059999203', email: 'natalie.d@example.com',       address_street: '12 Eliza St',        address_city: 'Thornbury',  address_postal_code: 'N0H 2P0', zone: ZONE_MEAFORD, lat: 44.5601, lng: -80.4508, driver_instructions: null },
  { first_name: 'Kevin',    last_name: 'Hartley',   phone: '+17059999204', email: 'k.hartley@example.com',       address_street: '89 Bruce St S',      address_city: 'Thornbury',  address_postal_code: 'N0H 2P0', zone: ZONE_MEAFORD, lat: 44.5588, lng: -80.4521, driver_instructions: 'Ring twice' },
  { first_name: 'Stephanie',last_name: 'Lau',       phone: '+17059999205', email: 'steph.lau@example.com',       address_street: '156 Collingwood St', address_city: 'Thornbury',  address_postal_code: 'N0H 2P0', zone: ZONE_MEAFORD, lat: 44.5612, lng: -80.4492, driver_instructions: null },
]

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱  Seeding test data for The LNDRY Co…\n')

  // ── 1. Customers ────────────────────────────────────────────────────────────
  console.log('👥  Creating customers…')
  const customerRows = CUSTOMERS.map((c) => ({
    tenant_id:            TENANT_ID,
    first_name:           c.first_name,
    last_name:            c.last_name,
    phone:                c.phone,
    email:                c.email,
    address_street:       c.address_street,
    address_city:         c.address_city,
    address_postal_code:  c.address_postal_code,
    driver_instructions:  c.driver_instructions,
    lat:                  c.lat,
    lng:                  c.lng,
    notification_preference: 'sms_email',
    payment_type:         'on_account',
    marketing_opt_in:     true,
    invoice_style:        'standard',
    discount_percent:     0,
    tax_exempt:           false,
    account_balance:      0,
    delivery_fee_cents:   0,
  }))

  const createdCustomers = await insert('customers', customerRows)
  const customerIds = createdCustomers.map((r) => r.id)
  console.log(`   ✓ ${customerIds.length} customers created`)

  // Helper to pair each customer with its zone
  const customerZone = (idx) => CUSTOMERS[idx].zone

  // ── 2. Orders ────────────────────────────────────────────────────────────────
  console.log('📦  Creating orders…')

  const orders = []

  // Mix of statuses, weights, services
  const orderDefs = [
    { cidx: 0,  svcId: SVC_STANDARD, qty: 8.5,  status: 'cleaning',  daysBack: 0 },
    { cidx: 1,  svcId: SVC_BASIC,    qty: 12.0, status: 'cleaning',  daysBack: 0 },
    { cidx: 2,  svcId: SVC_PREMIUM,  qty: 6.0,  status: 'ready',     daysBack: 1 },
    { cidx: 3,  svcId: SVC_STANDARD, qty: 9.5,  status: 'ready',     daysBack: 1 },
    { cidx: 4,  svcId: SVC_BASIC,    qty: 14.0, status: 'picked_up', daysBack: 3 },
    { cidx: 5,  svcId: SVC_PREMIUM,  qty: 7.5,  status: 'picked_up', daysBack: 5 },
    { cidx: 6,  svcId: SVC_STANDARD, qty: 11.0, status: 'delivered', daysBack: 4 },
    { cidx: 7,  svcId: SVC_BASIC,    qty: 8.0,  status: 'cleaning',  daysBack: 0 },
    { cidx: 8,  svcId: SVC_PREMIUM,  qty: 5.5,  status: 'ready',     daysBack: 2 },
    { cidx: 9,  svcId: SVC_STANDARD, qty: 10.0, status: 'cleaning',  daysBack: 0 },
    { cidx: 10, svcId: SVC_BASIC,    qty: 13.0, status: 'picked_up', daysBack: 2 },
    { cidx: 11, svcId: SVC_PREMIUM,  qty: 9.0,  status: 'cleaning',  daysBack: 1 },
    { cidx: 12, svcId: SVC_STANDARD, qty: 7.0,  status: 'ready',     daysBack: 1 },
    { cidx: 13, svcId: SVC_BASIC,    qty: 11.5, status: 'pending',   daysBack: 0 },
    { cidx: 14, svcId: SVC_PREMIUM,  qty: 6.5,  status: 'cleaning',  daysBack: 0 },
    // A few repeats for busy customers
    { cidx: 0,  svcId: SVC_BASIC,    qty: 10.0, status: 'picked_up', daysBack: 7 },
    { cidx: 2,  svcId: SVC_STANDARD, qty: 8.0,  status: 'delivered', daysBack: 10 },
    { cidx: 4,  svcId: SVC_PREMIUM,  qty: 7.0,  status: 'cleaning',  daysBack: 0 },
  ]

  // Price lookup
  const PRICES = { [SVC_BASIC]: 225, [SVC_STANDARD]: 250, [SVC_PREMIUM]: 300 }
  const NAMES  = { [SVC_BASIC]: 'Basic Wash & Fold', [SVC_STANDARD]: 'Standard Wash & Fold', [SVC_PREMIUM]: 'Premium Wash & Fold' }

  for (const def of orderDefs) {
    const cid = customerIds[def.cidx]
    const cName = `${CUSTOMERS[def.cidx].first_name} ${CUSTOMERS[def.cidx].last_name}`
    const unitPrice = PRICES[def.svcId]
    const lineTotal = Math.round(def.qty * unitPrice)
    const orderNum = nextOrderNumber()
    const createdAt = daysAgo(def.daysBack)

    const { data: order, error: oe } = await sb.from('orders').insert({
      tenant_id:        TENANT_ID,
      order_number:     orderNum,
      customer_id:      cid,
      customer_name:    cName,
      status:           def.status,
      payment_status:   def.status === 'picked_up' || def.status === 'delivered' ? 'paid' : 'pending',
      subtotal:         lineTotal,
      tax_amount:       0,
      discount_amount:  0,
      total_amount:     lineTotal,
      paid_amount:      def.status === 'picked_up' || def.status === 'delivered' ? lineTotal : 0,
      created_by:       STAFF_USER_ID,
      created_at:       createdAt,
      updated_at:       createdAt,
      ready_at:         def.status === 'ready' || def.status === 'picked_up' || def.status === 'delivered'
                          ? daysAgo(def.daysBack - 1) : null,
      picked_up_at:     def.status === 'picked_up' || def.status === 'delivered'
                          ? daysAgo(Math.max(0, def.daysBack - 2)) : null,
    }).select('id').single()

    if (oe) { console.error(`   ✗ Order ${orderNum}:`, oe.message); continue }

    await sb.from('order_lines').insert({
      order_id:         order.id,
      tenant_id:        TENANT_ID,
      service_item_id:  def.svcId,
      name:             NAMES[def.svcId],
      category:         'wash_fold',
      quantity:         def.qty,
      unit_price:       unitPrice,
      unit_label:       'lbs',
      line_total:       lineTotal,
    })

    orders.push({ id: order.id, cidx: def.cidx, status: def.status, orderNum })
  }
  console.log(`   ✓ ${orders.length} orders created`)

  // ── 3. Pickup stops for today + next 3 days ──────────────────────────────────
  console.log('🚚  Creating pickup stops…')

  // Ready orders → delivery stops today and tomorrow
  const deliveryStops = orders
    .filter((o) => o.status === 'ready')
    .map((o, i) => ({
      tenant_id:      TENANT_ID,
      customer_id:    customerIds[o.cidx],
      order_id:       o.id,
      type:           'delivery',
      scheduled_date: isoDate(i % 2 === 0 ? 0 : 1),  // spread across today/tomorrow
      status:         'pending',
      zone_id:        customerZone(o.cidx),
      time_start:     i % 2 === 0 ? '10:00' : '14:00',
      time_end:       i % 2 === 0 ? '12:00' : '16:00',
      sequence_order: i,
    }))

  // Pending orders → pickup stops
  const pendingOrders = orders.filter((o) => o.status === 'pending')
  const pickupStops = [
    // Pending orders already have stops from createPickup — skip those
    // Add fresh one-off pickups for various customers
    { cidx: 1,  date: 0, time: '09:00', zone: ZONE_OWEN },
    { cidx: 3,  date: 0, time: '11:00', zone: ZONE_OWEN },
    { cidx: 6,  date: 0, time: '14:30', zone: ZONE_OWEN },
    { cidx: 10, date: 1, time: '10:00', zone: ZONE_MEAFORD },
    { cidx: 12, date: 1, time: '13:00', zone: ZONE_MEAFORD },
    { cidx: 14, date: 1, time: '15:00', zone: ZONE_MEAFORD },
    { cidx: 4,  date: 2, time: '09:30', zone: ZONE_OWEN },
    { cidx: 7,  date: 2, time: '11:30', zone: ZONE_OWEN },
    { cidx: 11, date: 3, time: '10:00', zone: ZONE_MEAFORD },
    { cidx: 13, date: 3, time: '14:00', zone: ZONE_MEAFORD },
  ].map((s, i) => ({
    tenant_id:      TENANT_ID,
    customer_id:    customerIds[s.cidx],
    type:           'pickup',
    scheduled_date: isoDate(s.date),
    status:         'pending',
    zone_id:        s.zone,
    time_start:     s.time,
    sequence_order: i,
  }))

  const allStops = [...deliveryStops, ...pickupStops]
  if (allStops.length) {
    const { error: se } = await sb.from('pickup_stops').insert(allStops)
    if (se) console.error('   ✗ Stops:', se.message)
    else console.log(`   ✓ ${allStops.length} pickup/delivery stops created`)
  }

  // ── 4. Recurring schedules ───────────────────────────────────────────────────
  console.log('📅  Creating recurring schedules…')

  const schedules = [
    { cidx: 0,  freq: 'weekly',    dow: 1, start: '09:00', end: '11:00', zone: ZONE_OWEN    },
    { cidx: 2,  freq: 'weekly',    dow: 3, start: '13:00', end: '15:00', zone: ZONE_OWEN    },
    { cidx: 5,  freq: 'biweekly',  dow: 2, start: '10:00', end: '12:00', zone: ZONE_OWEN    },
    { cidx: 8,  freq: 'weekly',    dow: 4, start: '14:00', end: '16:00', zone: ZONE_OWEN    },
    { cidx: 10, freq: 'weekly',    dow: 1, start: '10:00', end: '12:00', zone: ZONE_MEAFORD },
    { cidx: 12, freq: 'biweekly',  dow: 3, start: '11:00', end: '13:00', zone: ZONE_MEAFORD },
    { cidx: 14, freq: 'monthly',   dow: null, start: null,  end: null,   zone: ZONE_MEAFORD },
  ].map((s) => {
    // Calculate next pickup date based on day_of_week
    let nextDate = isoDate(1)
    if (s.dow !== null) {
      const d = new Date()
      const today = d.getDay()
      const diff = ((s.dow - today) + 7) % 7 || 7
      d.setDate(d.getDate() + diff)
      nextDate = d.toISOString().split('T')[0]
    }
    return {
      tenant_id:        TENANT_ID,
      customer_id:      customerIds[s.cidx],
      frequency:        s.freq,
      day_of_week:      s.dow,
      pickup_start:     s.start,
      pickup_end:       s.end,
      zone_id:          s.zone,
      status:           'active',
      next_pickup_date: nextDate,
    }
  })

  const { error: sche } = await sb.from('pickup_schedules').insert(schedules)
  if (sche) console.error('   ✗ Schedules:', sche.message)
  else console.log(`   ✓ ${schedules.length} recurring schedules created`)

  console.log('\n✅  Done! Refresh the app to see the test data.')
}

main().catch(console.error)
