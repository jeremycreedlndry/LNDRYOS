import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'LNDRYOS Driver',
  description: 'Driver route app',
}

// Full-screen layout with no sidebar — optimized for mobile
export default function DriveLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {children}
    </div>
  )
}
