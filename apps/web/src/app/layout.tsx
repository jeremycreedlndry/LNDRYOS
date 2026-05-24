import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'LNDRYOS — Laundry Management',
  description: 'Point of sale and management for laundry and dry cleaning businesses',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'LNDRYOS Driver',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <Providers>{children}</Providers>
        {mapsKey && (
          <Script
            src={`https://maps.googleapis.com/maps/api/js?key=${mapsKey}&libraries=places`}
            strategy="lazyOnload"
          />
        )}
      </body>
    </html>
  )
}
