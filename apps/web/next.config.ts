import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@laundry/api', '@laundry/db'],
  serverExternalPackages: ['stripe', 'net'],
  typescript: { ignoreBuildErrors: true },
  allowedDevOrigins: ['192.168.1.79', '192.168.1.0/24'],
}

export default nextConfig
