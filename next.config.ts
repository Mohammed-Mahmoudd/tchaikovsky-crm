import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
