import { router } from './trpc'
import { customersRouter } from './routers/customers'
import { catalogRouter } from './routers/catalog'
import { ordersRouter } from './routers/orders'
import { paymentsRouter } from './routers/payments'
import { tenantsRouter } from './routers/tenants'
import { priceListsRouter } from './routers/priceLists'
import { equipmentRouter } from './routers/equipment'
import { orderIssuesRouter } from './routers/orderIssues'
import { nayaxRouter } from './routers/nayax'
import { deliveryZonesRouter } from './routers/deliveryZones'
import { pickupSchedulesRouter } from './routers/pickupSchedules'
import { pickupStopsRouter } from './routers/pickupStops'
import { staffRouter } from './routers/staff'
import { notificationsRouter } from './routers/notifications'
import { orderNotesRouter } from './routers/orderNotes'
import { messagesRouter } from './routers/messages'
import { businessAccountsRouter } from './routers/businessAccounts'
import { invoicesRouter } from './routers/invoices'
import { prepaidCardsRouter } from './routers/prepaidCards'

export const appRouter = router({
  customers: customersRouter,
  catalog: catalogRouter,
  orders: ordersRouter,
  payments: paymentsRouter,
  tenants: tenantsRouter,
  priceLists: priceListsRouter,
  equipment: equipmentRouter,
  orderIssues: orderIssuesRouter,
  nayax: nayaxRouter,
  deliveryZones: deliveryZonesRouter,
  pickupSchedules: pickupSchedulesRouter,
  pickupStops: pickupStopsRouter,
  staff: staffRouter,
  notifications: notificationsRouter,
  orderNotes: orderNotesRouter,
  messages: messagesRouter,
  businessAccounts: businessAccountsRouter,
  invoices: invoicesRouter,
  prepaidCards: prepaidCardsRouter,
})

export type AppRouter = typeof appRouter
export * from './trpc'
