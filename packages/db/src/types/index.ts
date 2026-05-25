export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

// ─── Enums ────────────────────────────────────────────────────────────────────

export type TenantStatus = 'active' | 'suspended' | 'cancelled'
export type SubscriptionPlan = 'starter' | 'professional' | 'enterprise'
export type OrderStatus =
  | 'cleaning'
  | 'ready'
  | 'picked_up'
  | 'delivered'
  | 'cancelled'
  | 'pending'
  | 'in_progress'

export type EquipmentType = 'washer' | 'dryer' | 'folding'

export interface Equipment {
  id: string
  tenant_id: string
  type: EquipmentType
  name: string
  is_active: boolean
  sort_order: number
  nayax_device_id: string | null
  created_at: string
}

export interface PendingTap {
  id: string
  tenant_id: string
  equipment_id: string | null
  employee_user_id: string | null
  nayax_device_id: string
  nayax_card_id: string
  tapped_at: string
  resolved: boolean
  resolved_order_id: string | null
  resolved_at: string | null
  created_at: string
}
export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'failed'
export type PaymentMethod = 'card_present' | 'card_online' | 'cash' | 'account_credit'
export type ItemCategory =
  | 'wash_fold'
  | 'dry_clean'
  | 'press_only'
  | 'alterations'
  | 'other'
  | 'gift_card'
  | 'product'
  | 'upcharge'

// ─── Tenant (one row = one laundry business) ─────────────────────────────────

export interface Tenant {
  id: string
  name: string
  slug: string
  status: TenantStatus
  plan: SubscriptionPlan
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  stripe_terminal_location_id: string | null
  currency: string
  timezone: string
  logo_url: string | null
  address: Json | null
  settings: TenantSettings
  created_at: string
  updated_at: string
}

export interface OrderPreferenceOptions {
  bleach?: string[]
  dryer_sheets?: string[]
  detergent_type?: string[]
  fabric_softener?: string[]
  wash_temperature?: string[]
}

export type DefaultPaymentType =
  | 'saved_card'
  | 'card_terminal'
  | 'pay_on_collection'
  | 'cash'
  | 'direct_deposit'
  | 'invoice'

export interface TenantSettings {
  receipt_footer?: string
  tax_rate?: number
  tax_name?: string
  tax_id?: string
  logo_url?: string
  phone?: string
  website_url?: string
  etransfer_email?: string   // e-Transfer payment destination shown on invoices
  offers_pickup_delivery?: boolean
  offers_wash_fold?: boolean
  hours?: Record<string, { enabled: boolean; open: string; close: string }>
  require_customer_on_order?: boolean
  auto_sms_ready?: boolean
  auto_email_ready?: boolean
  default_due_days?: number
  order_preference_options?: OrderPreferenceOptions
  /** Default payment method pre-selected at checkout. Falls back to saved_card. */
  default_payment_type?: DefaultPaymentType
}

export interface TenantAddress {
  street?: string
  city?: string
  province?: string
  postal_code?: string
  country?: string
  formatted?: string
  lat?: number
  lng?: number
}

// ─── Staff / Users ────────────────────────────────────────────────────────────

export type StaffRole = 'owner' | 'manager' | 'staff'

export interface StaffPermissions {
  pos?:       boolean
  orders?:    boolean
  customers?: boolean
  reports?:   boolean
  settings?:  boolean
  staff?:     boolean
  equipment?: boolean
}

export interface TenantMember {
  id: string
  tenant_id: string
  user_id: string
  role: StaffRole
  display_name: string
  email: string
  phone: string | null
  hourly_rate_cents: number | null
  permissions: StaffPermissions
  is_active: boolean
  created_at: string
}

export interface TimeEntry {
  id: string
  tenant_id: string
  user_id: string
  clocked_in_at: string
  clocked_out_at: string | null
  notes: string | null
  created_at: string
}

// ─── Price Lists ──────────────────────────────────────────────────────────────

export interface PriceList {
  id: string
  tenant_id: string
  name: string
  is_default: boolean
  created_at: string
}

export interface PriceListItem {
  id: string
  price_list_id: string
  service_item_id: string
  unit_price: number
  created_at: string
}

// ─── Customers ────────────────────────────────────────────────────────────────

export interface CustomerOrderPreferences {
  bleach?: string
  dryer_sheets?: string
  detergent_type?: string
  fabric_softener?: string
  wash_temperature?: string
}

export interface Customer {
  id: string
  tenant_id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  secondary_phone: string | null
  address_street: string | null
  address_apt: string | null
  address_city: string | null
  address_postal_code: string | null
  driver_instructions: string | null
  notes: string | null
  private_notes: string | null
  account_balance: number
  price_list_id: string | null
  payment_type: string
  marketing_opt_in: boolean
  invoice_style: string
  discount_percent: number
  tax_exempt: boolean
  order_preferences: CustomerOrderPreferences
  stripe_customer_id: string | null
  saved_card_last4: string | null
  saved_card_brand: string | null
  delivery_fee_cents: number
  notification_preference: 'sms' | 'email' | 'sms_email' | 'none'
  created_at: string
  updated_at: string
}

// ─── Service Catalog ──────────────────────────────────────────────────────────

export interface ServiceItem {
  id: string
  tenant_id: string
  name: string
  description: string | null
  category: ItemCategory
  unit_price: number
  unit_label: string
  is_active: boolean
  sort_order: number
  preference_groups: string[] | null
  created_at: string
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export interface Order {
  id: string
  tenant_id: string
  order_number: string
  customer_id: string | null
  customer_name: string | null
  status: OrderStatus
  payment_status: PaymentStatus
  subtotal: number
  tax_amount: number
  discount_amount: number
  total_amount: number
  paid_amount: number
  notes: string | null
  due_date: string | null
  ready_at: string | null
  picked_up_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface OrderLine {
  id: string
  order_id: string
  tenant_id: string
  service_item_id: string | null
  name: string
  category: ItemCategory
  quantity: number
  unit_price: number
  line_total: number
  notes: string | null
  tag_number: string | null
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export interface Payment {
  id: string
  tenant_id: string
  order_id: string
  amount: number
  method: PaymentMethod
  status: PaymentStatus
  stripe_payment_intent_id: string | null
  stripe_terminal_reader_id: string | null
  cash_tendered: number | null
  change_due: number | null
  processed_by: string
  processed_at: string
  created_at: string
}

// ─── Order Issues ─────────────────────────────────────────────────────────────

export interface IssueCategory {
  id: string
  tenant_id: string
  label: string
  sort_order: number
  created_at: string
}

// ─── Pickup & Delivery ────────────────────────────────────────────────────────

export type PickupFrequency = 'once' | 'weekly' | 'biweekly' | 'monthly'
export type StopType   = 'pickup' | 'delivery'
export type StopStatus = 'pending' | 'en_route' | 'completed' | 'failed' | 'skipped'

export interface DeliveryZone {
  id: string
  tenant_id: string
  name: string
  color: string
  coordinates: [number, number][]  // [lng, lat] pairs
  sort_order: number
  is_active: boolean
  created_at: string
}

export interface PickupSchedule {
  id: string
  tenant_id: string
  customer_id: string
  zone_id: string | null
  frequency: PickupFrequency
  day_of_week: number | null
  next_pickup_date: string | null
  pickup_start: string | null
  pickup_end: string | null
  delivery_start: string | null
  delivery_end: string | null
  delivery_days_later: number
  auto_create_order: boolean
  end_date: string | null
  notes: string | null
  status: 'active' | 'paused' | 'cancelled'
  created_at: string
  updated_at: string
}

export interface PickupStop {
  id: string
  tenant_id: string
  schedule_id: string | null
  customer_id: string
  order_id: string | null
  zone_id: string | null
  driver_user_id: string | null
  type: StopType
  status: StopStatus
  scheduled_date: string
  time_start: string | null
  time_end: string | null
  sequence_order: number
  notes: string | null
  driver_notes: string | null
  completed_at: string | null
  created_at: string
}

export interface OrderIssue {
  id: string
  tenant_id: string
  order_id: string
  photo_url: string
  storage_path: string
  category: string
  note: string | null
  created_by: string | null
  created_at: string
}

// ─── Hydrated / Joined types ──────────────────────────────────────────────────

export interface OrderWithLines extends Order {
  lines: OrderLine[]
  customer: Customer | null
  payments: Payment[]
}
