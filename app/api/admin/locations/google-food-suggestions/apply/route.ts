import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { buildApplySuggestionUpdate } from "@/lib/google/places";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const VALID_TABLES = new Set(["locations", "restaurants", "activities"]);

export async function POST(req: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin", "manager", "editor"]);
  if (auth.error) return auth.error;

  const body = await req.json();
  const suggestionIds = Array.isArray(body.suggestionIds) ? body.suggestionIds.filter(Boolean) : [];
  const action = body.action;

  if (!suggestionIds.length || !["approve", "reject"].includes(action)) {
    return Response.json({ success: false, error: "Provide suggestionIds and action approve or reject." }, { status: 400 });
  }

  const { data: suggestions, error } = await supabaseAdmin
    .from("location_google_food_term_suggestions")
    .select("*")
    .in("id", suggestionIds);

  if (error) return Response.json({ success: false, error: error.message }, { status: 400 });

  if (action === "reject") {
    const { error: rejectError } = await supabaseAdmin
      .from("location_google_food_term_suggestions")
      .update({ status: "rejected", reviewed_by: auth.adminUser?.user_id, reviewed_at: new Date().toISOString() })
      .in("id", suggestionIds);
    if (rejectError) return Response.json({ success: false, error: rejectError.message }, { status: 400 });
    return Response.json({ success: true, rejected: suggestions?.length || 0 });
  }

  let approved = 0;
  const failures: Array<{ id: string; error: string }> = [];

  for (const suggestion of suggestions || []) {
    if (!VALID_TABLES.has(suggestion.source_table)) {
      failures.push({ id: suggestion.id, error: "Invalid source table" });
      continue;
    }

    const { data: location, error: locationError } = await supabaseAdmin
      .from(suggestion.source_table)
      .select("*")
      .eq("id", suggestion.source_id)
      .maybeSingle();

    if (locationError || !location) {
      failures.push({ id: suggestion.id, error: locationError?.message || "Source row not found" });
      continue;
    }

    const update = {
      ...buildApplySuggestionUpdate(location, suggestion),
      google_place_id: suggestion.google_place_id || location.google_place_id,
      google_enrichment_status: "approved",
      google_enriched_at: new Date().toISOString(),
      google_primary_type: suggestion.google_primary_type || location.google_primary_type,
      google_types: suggestion.google_types || location.google_types || [],
      google_last_error: null,
    };

    const { error: updateError } = await supabaseAdmin
      .from(suggestion.source_table)
      .update(update)
      .eq("id", suggestion.source_id);

    if (updateError) {
      failures.push({ id: suggestion.id, error: updateError.message });
      continue;
    }

    const { error: suggestionError } = await supabaseAdmin
      .from("location_google_food_term_suggestions")
      .update({ status: "approved", reviewed_by: auth.adminUser?.user_id, reviewed_at: new Date().toISOString(), applied_at: new Date().toISOString() })
      .eq("id", suggestion.id);

    if (suggestionError) failures.push({ id: suggestion.id, error: suggestionError.message });
    else approved += 1;
  }

  return Response.json({ success: failures.length === 0, approved, failures });
}
