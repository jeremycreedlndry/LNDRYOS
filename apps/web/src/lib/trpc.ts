import { createTRPCReact } from '@trpc/react-query'
import type { AppRouter } from '@laundry/api'

export const trpc = createTRPCReact<AppRouter>()
