/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async rewrites() {
    return [{ source: "/api/stripe/connect/webhooK", destination: "/api/stripe/connect/webhook" }];
  },
  turbopack: {
    root: process.cwd(),
  },
};

module.exports = nextConfig;
