import { requireLocationPermission } from "@/lib/auth/locationOwnerAccess";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const locationId = String(body.locationId || "").trim();
    const assetUrl = String(body.assetUrl || "").trim();
    const allow = body.allow === true;

    if (!locationId || !/^https?:\/\//i.test(assetUrl)) {
      return Response.json({ success: false, error: "A valid location and public media URL are required." }, { status: 400 });
    }

    const { access, error } = await requireLocationPermission({
      request,
      locationId,
      permission: "marketing.edit",
    });
    if (error) return error;

    const canonicalLocationId = access.canonicalLocationId || locationId;
    const now = new Date().toISOString();
    const { data: existing } = await supabaseAdmin
      .from("marketing_assets")
      .select("id")
      .eq("scope", "location")
      .eq("location_id", canonicalLocationId)
      .eq("storage_path", assetUrl)
      .maybeSingle();

    const values = {
      scope: "location",
      location_id: canonicalLocationId,
      asset_type: "image",
      storage_path: assetUrl,
      display_name: "Location profile media",
      source: "location_profile",
      rights_status: allow ? "permission_granted" : "restricted",
      allow_theouthaven_feature: allow,
      allowed_platforms: allow ? ["instagram", "facebook", "tiktok", "youtube"] : [],
      uploaded_by: access.userId || null,
      metadata: {
        permission_scope: "organic_recommendations_and_social",
        permission_updated_at: now,
        permission_updated_by: access.userId || null,
      },
      updated_at: now,
    };

    const result = existing?.id
      ? await supabaseAdmin.from("marketing_assets").update(values).eq("id", existing.id).select("id,rights_status,allow_theouthaven_feature").single()
      : await supabaseAdmin.from("marketing_assets").insert({ ...values, created_at: now }).select("id,rights_status,allow_theouthaven_feature").single();

    if (result.error) throw result.error;

    await supabaseAdmin.from("admin_system_logs").insert({
      level: "info",
      category: "marketing",
      action: allow ? "location_media_feature_permission_granted" : "location_media_feature_permission_revoked",
      message: `${allow ? "Granted" : "Revoked"} TheOutHaven feature permission for location media`,
      actor_user_id: access.userId || null,
      actor_email: access.userEmail || null,
      entity_type: "location",
      entity_id: canonicalLocationId,
      metadata: { asset_url: assetUrl, asset_id: result.data?.id || null },
    }).then(undefined, () => undefined);

    return Response.json({ success: true, asset: result.data });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : "Could not update media permission." }, { status: 500 });
  }
}
