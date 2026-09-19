/** @type {import('next').NextConfig} */
// Vercel production root: apps/consumer.
const nextConfig = {
  poweredByHeader: false,
  turbopack: {
    root: process.cwd(),
  },
};

module.exports = nextConfig;
