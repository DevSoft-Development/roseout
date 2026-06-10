import { requireAdminApiRole } from "@/lib/admin-api-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin", "manager"]);
  if (auth.error) return auth.error;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const cronSecret = process.env.GOOGLE_LOCATION_ENRICHMENT_CRON_SECRET || process.env.CRON_SECRET;

  if (!supabaseUrl || !cronSecret) {
    return Response.json(
      { success: false, error: "Missing Supabase URL or cron secret configuration." },
      { status: 500 },
    );
  }

  const body = await req.json();
  const response = await fetch(`${supabaseUrl}/functions/v1/google-location-enrichment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-secret": cronSecret,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let result: unknown = text;

  if (text) {
    try {
      result = JSON.parse(text);
    } catch {
      result = text;
    }
  }

  return Response.json(
    { success: response.ok, result },
    { status: response.ok ? 200 : response.status },
  );
}
