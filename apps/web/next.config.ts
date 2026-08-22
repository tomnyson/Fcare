import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@fcare/ui-kit', '@fcare/shared-types'],
};

export default nextConfig;
