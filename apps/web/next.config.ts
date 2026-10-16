import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  async redirects() {
    // The old Investments page showed mock data; currency exchange replaced it
    return [{ source: '/investments', destination: '/exchange', permanent: false }];
  },
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

export default withNextIntl(nextConfig);
