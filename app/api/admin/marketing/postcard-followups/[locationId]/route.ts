import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { mutateTask } from "@/lib/crm/tasks/service";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function urlOrNull(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  try {
    const url = new URL(text.startsWith("http") ? text : `https://${text}`);
    return url.toString();
  } catch {
    return null;
  }
}

export async function PATCH(req: Request, context: { params: Promise<{ locationId: string }> }) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.marketingEdit);
  if (auth.error) return auth.error;
  if (!auth.adminUser) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const { locationId } = await context.params;
    const body = await req.json();
    const instagram = urlOrNull(body.instagram_url);
    const facebook = urlOrNull(body.facebook_url);
    const tiktok = urlOrNull(body.tiktok_url);
    const now = new Date().toISOString();

    const { data: location, error } = await supabaseAdmin
      .from("locations")
      .update({
        instagram_url: instagram,
        facebook_url: facebook,
        tiktok_url: tiktok,
        claim_last_follow_up_at: now,
        updated_at: now,
      })
      .eq("id", locationId)
      .select("id,name,business_name,restaurant_name,activity_name")
      .maybeSingle();
    if (error) throw error;
    if (!location) return NextResponse.json({ success: false, error: "Location not found." }, { status: 404 });

    await supabaseAdmin.from("crm_activities").insert({
      location_id: locationId,
      actor_user_id: auth.adminUser.user_id,
      activity_type: "social_follow_up",
      direction: "outbound",
      channel: "social",
      summary: `Postcard social follow-up completed for ${location.name || location.business_name || location.restaurant_name || location.activity_name || "location"}.`,
      outcome: "completed",
      occurred_at: now,
      source_system: "marketing",
      source_table: "locations",
      source_record_id: locationId,
      is_system_generated: false,
      metadata: { instagram_url: instagram, facebook_url: facebook, tiktok_url: tiktok },
    });

    if (typeof body.task_id === "string" && body.task_id) {
      const { data: task } = await supabaseAdmin.from("crm_tasks").select("id,version,status").eq("id", body.task_id).maybeSingle();
      if (task && !["completed", "cancelled"].includes(task.status)) {
        await mutateTask(
          task.id,
          task.version,
          { status: "completed", completion_notes: "Social accounts checked and verified URLs saved to the location record." },
          { user_id: auth.adminUser.user_id, email: auth.adminUser.email || null, role: auth.adminUser.role },
          "Postcard social follow-up completed",
        );
      }
    }

    return NextResponse.json({ success: true, location_id: locationId, instagram_url: instagram, facebook_url: facebook, tiktok_url: tiktok });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not save social follow-up." }, { status: 500 });
  }
}
