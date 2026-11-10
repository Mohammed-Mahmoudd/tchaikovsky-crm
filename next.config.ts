import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    proxyTimeout: 120000,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "https://api.tchaikovskyschool.com/crm-api/:path*",
      },
      {
        source: "/crm-api/:path*",
        destination: "https://api.tchaikovskyschool.com/crm-api/:path*",
      },
    ];
  },
};

export default nextConfig;

