import { type Metadata } from 'next'
import { createSupabaseServiceClient } from '@laundry/db'

interface Props {
  params: Promise<{ orderId: string }>
  children: React.ReactNode
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { orderId } = await params

  try {
    const supabase = createSupabaseServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data: order } = await supabase
      .from('orders')
      .select('order_number, total_amount, paid_amount, tenant:tenants(name)')
      .eq('id', orderId)
      .single()

    if (!order) return { title: 'Pay Order' }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storeName  = (order.tenant as any)?.name ?? 'The LNDRY Co.'
    const balance    = order.total_amount - (order.paid_amount ?? 0)
    const total      = `$${(balance / 100).toFixed(2)}`
    const title      = `${storeName}: ${order.order_number}`
    const description = `Order total ${total}. Click to pay.`

    return {
      title,
      description,
      openGraph: { title, description },
    }
  } catch {
    return { title: 'Pay Order' }
  }
}

export default function PayOrderLayout({ children }: Props) {
  return <>{children}</>
}
