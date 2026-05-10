// Allow Vercel/CI builds to evaluate server modules that create Supabase
// clients at module scope before runtime environment variables are injected.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://placeholder.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "placeholder-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "placeholder-service-role-key";

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

module.exports = nextConfig;