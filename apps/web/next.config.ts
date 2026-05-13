import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@laundry/api', '@laundry/db'],
  serverExternalPackages: ['stripe'],
  typescript: { ignoreBuildErrors: true },
}

export default nextConfig
