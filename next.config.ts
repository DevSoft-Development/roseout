// Secrets must be supplied by Vercel/Supabase environment variables and must never be hardcoded in this repo.

/** @type {import('next').NextConfig} */
const myWorkspaceRedirects = [
  "",
  "/site-visits",
  "/social-outreach",
  "/support-work",
  "/demo",
  "/payroll",
].flatMap((suffix) => [
  { source: `/team${suffix}`, destination: `/my-workspace${suffix}`, permanent: false },
  { source: `/workspace${suffix}`, destination: `/my-workspace${suffix}`, permanent: false },
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