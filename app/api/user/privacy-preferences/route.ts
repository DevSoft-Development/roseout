import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireUser() {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  return user ?? null;
}

export async function GET(request: Request) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("consumer_profiles")
    .select("personalization_enabled,personalization_updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return Response.json({ error: "Could not load privacy preferences." }, { status: 500 });

  return Response.json({
    personalizationEnabled: data?.personalization_enabled !== false,
    updatedAt: data?.personalization_updated_at ?? null,
  });
}

export async function PATCH(request: Request) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const enabled = (body as { personalizationEnabled?: unknown })?.personalizationEnabled;
  if (typeof enabled !== "boolean") {
    return Response.json({ error: "personalizationEnabled must be boolean." }, { status: 400 });
  }

  const updatedAt = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("consumer_profiles")
    .upsert(
      {
        user_id: user.id,
        personalization_enabled: enabled,
        personalization_updated_at: updatedAt,
        updated_at: updatedAt,
      },
      { onConflict: "user_id" },
    );

  if (error) return Response.json({ error: "Could not update privacy preferences." }, { status: 500 });

  if (!enabled) {
    const { error: vectorError } = await supabaseAdmin
      .from("user_search_preference_vectors")
      .delete()
      .eq("user_id", user.id);
    if (vectorError) {
      return Response.json({ error: "Could not fully disable personalization." }, { status: 500 });
    }
  }

  return Response.json({ personalizationEnabled: enabled, updatedAt });
}
