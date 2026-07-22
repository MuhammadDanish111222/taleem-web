import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  async headers() {
    return [
      {
        source: "/content/:path*",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Cache-Control",
            value: "private, no-cache, must-revalidate",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; object-src 'none';",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
