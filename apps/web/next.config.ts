import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@laundry/api', '@laundry/db'],
  serverExternalPackages: ['stripe'],
}

export default nextConfig
