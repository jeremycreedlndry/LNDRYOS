'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase-client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Shirt, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$49/mo',
    features: ['1 location', 'POS + order management', 'Email receipts', 'Customer history'],
  },
  {
    id: 'professional',
    name: 'Professional',
    price: '$99/mo',
    features: ['Up to 3 locations', 'Everything in Starter', 'SMS notifications', 'Pickup & delivery', 'Reports'],
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '$199/mo',
    features: ['Unlimited locations', 'Everything in Pro', 'API access', 'Priority support'],
  },
]

type Step = 'account' | 'store' | 'plan'

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>('account')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [storeName, setStoreName] = useState('')
  const [selectedPlan, setSelectedPlan] = useState('professional')
  const [loading, setLoading] = useState(false)
  const [existingUserId, setExistingUserId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createBrowserClient()

  // If already logged in, check for existing tenant
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      setExistingUserId(user.id)
      setEmail(user.email ?? '')

      // If tenant already exists, go straight to POS
      const res = await fetch('/api/tenants/me')
      const { tenant } = await res.json()
      if (tenant) {
        document.cookie = `tenant_id=${tenant.tenant_id}; path=/; max-age=31536000`
        router.replace('/pos')
        return
      }

      setStep('store')
    })
  }, [])

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setStep('store')
  }

  const handleStoreSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    setStep('plan')
  }

  const handleLaunch = async () => {
    setLoading(true)
    try {
      let userId = existingUserId

      if (!userId) {
        // New user — sign up
        const { data: authData, error: authError } = await supabase.auth.signUp({ email, password })
        if (authError) throw authError
        userId = authData.user?.id ?? null
        if (!userId) throw new Error('No user ID returned')
      }

      const res = await fetch('/api/tenants/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_name: storeName, plan: selectedPlan, user_id: userId, email }),
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? 'Setup failed')
      }

      const { tenant_id } = await res.json()
      if (tenant_id) {
        document.cookie = `tenant_id=${tenant_id}; path=/; max-age=31536000`
      }

      router.push('/pos')
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Setup failed')
      setLoading(false)
    }
  }

  const steps: Step[] = existingUserId ? ['store', 'plan'] : ['account', 'store', 'plan']
  const stepIndex = steps.indexOf(step)

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600">
            <Shirt className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {existingUserId ? 'Set up your store' : 'Get started with LNDRYOS'}
          </h1>
        </div>

        {/* Step indicators */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                step === s ? 'bg-brand-600 text-white' :
                stepIndex > i ? 'bg-green-500 text-white' :
                'bg-gray-200 text-gray-500'
              }`}>
                {stepIndex > i ? <CheckCircle className="h-4 w-4" /> : i + 1}
              </div>
              {i < steps.length - 1 && <div className="h-px w-8 bg-gray-300" />}
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          {step === 'account' && (
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <h2 className="text-lg font-semibold">Create your account</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} placeholder="Min. 8 characters" />
              </div>
              <Button type="submit" className="w-full">Continue</Button>
            </form>
          )}

          {step === 'store' && (
            <form onSubmit={handleStoreSetup} className="space-y-4">
              <h2 className="text-lg font-semibold">Set up your store</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Store name</label>
                <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} required placeholder="Main Street Cleaners" autoFocus />
              </div>
              <Button type="submit" className="w-full">Continue</Button>
            </form>
          )}

          {step === 'plan' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Choose your plan</h2>
              <div className="space-y-3">
                {PLANS.map((plan) => (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan.id)}
                    className={`relative w-full rounded-xl border-2 p-4 text-left transition-colors ${
                      selectedPlan === plan.id ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {plan.popular && (
                      <span className="absolute right-3 top-3 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">Popular</span>
                    )}
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-gray-900">{plan.name}</span>
                      <span className="text-sm font-bold text-gray-700">{plan.price}</span>
                    </div>
                    <ul className="space-y-0.5">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-center gap-1.5 text-xs text-gray-500">
                          <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </button>
                ))}
              </div>
              <Button onClick={handleLaunch} className="w-full" disabled={loading} size="lg">
                {loading ? 'Setting up...' : 'Launch my store'}
              </Button>
            </div>
          )}
        </div>

        {!existingUserId && (
          <p className="mt-4 text-center text-sm text-gray-500">
            Already have an account?{' '}
            <a href="/login" className="text-brand-600 hover:underline">Sign in</a>
          </p>
        )}
      </div>
    </div>
  )
}
