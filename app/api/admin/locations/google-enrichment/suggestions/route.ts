import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { buildApplySuggestionUpdate } from "@/lib/google/places";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const VALID_TABLES = new Set(["locations", "restaurants", "activities"]);
const SUGGESTION_STATUSES = [
  "pending_review",
  "auto_apply_ready",
  "approved",
  "rejected",
];

export async function GET() {
  const auth = await requireAdminApiRole(["superadmin", "admin", "manager", "editor"]);
  if (auth.error) return auth.error;

  const { data, error } = await supabaseAdmin
    .from("location_google_food_term_suggestions")
    .select("*")
    .in("status", SUGGESTION_STATUSES)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return Response.json({ success: false, error: error.message }, { status: 400 });
  }

  return Response.json({ success: true, suggestions: data || [] });
}

export async function POST(req: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin", "manager", "editor"]);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const action = body.action;
  const suggestionIds = Array.isArray(body.suggestionIds)
    ? body.suggestionIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
    : [];

  if (!suggestionIds.length || !["approve", "reject"].includes(action)) {
    return Response.json(
      { success: false, error: "Provide suggestionIds and action approve or reject." },
      { status: 400 },
    );
  }

  if (action === "reject") {
    const { error } = await supabaseAdmin
      .from("location_google_food_term_suggestions")
      .update({
        status: "rejected",
        reviewed_by: auth.adminUser?.user_id,
        reviewed_at: new Date().toISOString(),
      })
      .in("id", suggestionIds);

    if (error) {
      return Response.json({ success: false, error: error.message }, { status: 400 });
    }

    return Response.json({ success: true, rejected: suggestionIds.length });
  }

  const { data: suggestions, error } = await supabaseAdmin
    .from("location_google_food_term_suggestions")
    .select("*")
    .in("id", suggestionIds);

  if (error) {
    return Response.json({ success: false, error: error.message }, { status: 400 });
  }

  let approved = 0;
  const failures: Array<{ id: string; error: string }> = [];

  for (const suggestion of suggestions || []) {
    if (!VALID_TABLES.has(suggestion.source_table)) {
      failures.push({ id: suggestion.id, error: "Invalid source table." });
      continue;
    }

    const { data: source, error: sourceError } = await supabaseAdmin
      .from(suggestion.source_table)
      .select("*")
      .eq("id", suggestion.source_id)
      .maybeSingle();

    if (sourceError || !source) {
      failures.push({
        id: suggestion.id,
        error: sourceError?.message || "Source row not found.",
      });
      continue;
    }

    const update = {
      ...buildApplySuggestionUpdate(source, suggestion),
      google_place_id: suggestion.google_place_id || source.google_place_id,
      google_enrichment_status: "approved",
      google_enriched_at: new Date().toISOString(),
      google_primary_type: suggestion.google_primary_type || source.google_primary_type,
      google_types: suggestion.google_types || source.google_types || [],
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
      .update({
        status: "approved",
        reviewed_by: auth.adminUser?.user_id,
        reviewed_at: new Date().toISOString(),
        applied_at: new Date().toISOString(),
      })
      .eq("id", suggestion.id);

    if (suggestionError) {
      failures.push({ id: suggestion.id, error: suggestionError.message });
    } else {
      approved += 1;
    }
  }

  return Response.json({ success: failures.length === 0, approved, failures });
}
