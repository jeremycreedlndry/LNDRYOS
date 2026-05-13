import { CheckCircle } from 'lucide-react'

export default function PaySuccessPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
          <CheckCircle className="h-9 w-9 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment successful</h1>
        <p className="text-gray-500 text-sm">Thank you! Your payment has been received. We&apos;ll see you when you pick up your order.</p>
      </div>
    </div>
  )
}
