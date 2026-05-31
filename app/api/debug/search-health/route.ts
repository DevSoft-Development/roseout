export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  return Response.json({
    ok: true,
    env: {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(serviceRoleKey),
      supabaseUrlLooksValid:
        Boolean(supabaseUrl) &&
        supabaseUrl!.startsWith("https://") &&
        supabaseUrl!.includes(".supabase.co"),
      supabaseUrlPreview: supabaseUrl
        ? `${supabaseUrl.slice(0, 18)}...`
        : null,
      serviceRolePreview: serviceRoleKey
        ? `${serviceRoleKey.slice(0, 8)}...`
        : null,
    },
  });
}
