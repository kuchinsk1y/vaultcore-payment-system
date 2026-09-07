import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/:path*',
      },
    ];
  },
  experimental: {
    // @ts-expect-error turbopack is a valid experimental configuration but types may be missing
    turbopack: {
      root: typeof __dirname !== 'undefined' ? __dirname : process.cwd(),
    }
  }
};

export default nextConfig;
