// Secrets must be supplied by Vercel/Supabase environment variables and must never be hardcoded in this repo.

/** @type {import('next').NextConfig} */
const myWorkspaceRedirects = ["", "/site-visits", "/social-outreach", "/support-work", "/demo", "/payroll"].flatMap((suffix) => [
  { source: `/team${suffix}`, destination: `/my-workspace${suffix}`, permanent: false },
  { source: `/workspace${suffix}`, destination: `/my-workspace${suffix}`, permanent: false },
]);

const isProduction = process.env.NODE_ENV === "production";
const isVercel = Boolean(process.env.VERCEL);
const isAwsBackground = process.env.PLATFORM_RUNTIME_PROVIDER === "aws-background";
const contentSecurityPolicy = [
  "default-src 'self' https: data: blob:",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self' https://checkout.stripe.com",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"} https:`,
  "style-src 'self' 'unsafe-inline' https:",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' https: wss:",
  "frame-src 'self' https://challenges.cloudflare.com https://js.stripe.com https://hooks.stripe.com https://www.youtube.com",
  "worker-src 'self' blob:",
  ...(isProduction ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self), payment=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const nextConfig = {
  ...(isAwsBackground || !isVercel ? { output: "standalone" } : {}),
  ...(!isProduction ? { allowedDevOrigins: ["127.0.0.1"] } : {}),
  async redirects() { return myWorkspaceRedirects; },
  async headers() { return [{ source: "/:path*", headers: securityHeaders }]; },
  images: {
    maximumRedirects: 0,
    remotePatterns: [
      { protocol: "https", hostname: "maps.googleapis.com", pathname: "/maps/api/place/photo**" },
      { protocol: "https", hostname: "lh3.googleusercontent.com", pathname: "/**" },
      { protocol: "https", hostname: "**.googleusercontent.com", pathname: "/**" },
    ],
  },
};

module.exports = nextConfig;
