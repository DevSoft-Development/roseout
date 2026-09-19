import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: { root: path.resolve(__dirname) },
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  poweredByHeader: false,
  turbopack: {
    root: process.cwd(),
  },
};

module.exports = nextConfig;
