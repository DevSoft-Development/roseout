// Allow Vercel/CI builds to evaluate server modules that create Supabase
// clients at module scope before runtime environment variables are injected.
process.env.NEXT_PUBLIC_SUPABASE_URL ||=
  "https://hnhbzynoyrhjndefbwkh.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||=
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhuaGJ6eW5veXJoam5kZWZid2toIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczODU3MjQsImV4cCI6MjA5Mjk2MTcyNH0.2uepdJw_gV75J89ISGW4hqLuzBsWx112HbCKabYeKok";
process.env.SUPABASE_SERVICE_ROLE_KEY ||=
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhuaGJ6eW5veXJoam5kZWZid2toIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzM4NTcyNCwiZXhwIjoyMDkyOTYxNzI0fQ.xD7q6wQtB09Tg3ci6jtHEgmcEjG_Dt1x9FwTGVxfq5A";

/** @type {import('next').NextConfig} */
const myWorkspaceRedirects = [
  "",
  "/site-visits",
  "/social-outreach",
  "/support-work",
  "/demo",
  "/payroll",
].flatMap((suffix) => [
  {
    source: `/team${suffix}`,
    destination: `/my-workspace${suffix}`,
    permanent: false,
  },
  {
    source: `/workspace${suffix}`,
    destination: `/my-workspace${suffix}`,
    permanent: false,
  },
]);

const nextConfig = {
  async redirects() {
    return myWorkspaceRedirects;
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "maps.googleapis.com",
        pathname: "/maps/api/place/photo**",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

module.exports = nextConfig;
