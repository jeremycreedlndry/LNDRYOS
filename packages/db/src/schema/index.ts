// Re-export migration SQL paths for reference — run these in order in Supabase
export const migrations = [
  '001_tenants.sql',
  '002_customers.sql',
  '003_catalog.sql',
  '004_orders.sql',
  '005_payments.sql',
]
