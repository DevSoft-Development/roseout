import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabase
    .from("search_logs")
    .select("query, created_at")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const searches = Array.from(
    new Set((data || []).map((item) => item.query).filter(Boolean))
  ).slice(0, 4);

  return Response.json({ searches });
}