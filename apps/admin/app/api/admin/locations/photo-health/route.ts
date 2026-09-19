import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function claimedFilter(row: Record<string, unknown>) {
  return row.is_claimed === true || Boolean(row.owner_user_id) || String(row.claim_status || "").toLowerCase() === "approved";
}

function nameFor(row: Record<string, unknown>) {
  return String(row.name || row.restaurant_name || row.activity_name || "Unnamed location");
}

export async function GET() {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locations);
  if (auth.error) return auth.error;

  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id,name,restaurant_name,activity_name,location_type,city,state,claim_status,is_claimed,owner_user_id,owner_photo_count,has_owner_photos,owner_primary_photo_url,google_place_id,main_image,image_url,photo_source,profile_completion_score,claimed_at")
    .or("is_claimed.eq.true,claim_status.eq.approved,owner_user_id.not.is.null")
    .order("claimed_at", { ascending: false, nullsFirst: false })
    .limit(5000);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data || []).filter((row) => claimedFilter(row as Record<string, unknown>));
  const buckets = {
    zeroOwnerPhotos: rows.filter((row) => Number(row.owner_photo_count || 0) === 0).length,
    oneToTwoOwnerPhotos: rows.filter((row) => {
      const count = Number(row.owner_photo_count || 0);
      return count >= 1 && count <= 2;
    }).length,
    threeToFourOwnerPhotos: rows.filter((row) => {
      const count = Number(row.owner_photo_count || 0);
      return count >= 3 && count <= 4;
    }).length,
    fivePlusOwnerPhotos: rows.filter((row) => Number(row.owner_photo_count || 0) >= 5).length,
    googleCapable: rows.filter((row) => Boolean(String(row.google_place_id || "").trim())).length,
    ownerControlledHero: rows.filter((row) => Boolean(String(row.owner_primary_photo_url || "").trim())).length,
  };

  const needsPhotoFollowup = rows
    .filter((row) => Number(row.owner_photo_count || 0) < 3)
    .slice(0, 100)
    .map((row) => ({
      id: row.id,
      name: nameFor(row as Record<string, unknown>),
      locationType: row.location_type || null,
      city: row.city || null,
      state: row.state || null,
      ownerPhotoCount: Number(row.owner_photo_count || 0),
      googleCapable: Boolean(String(row.google_place_id || "").trim()),
      profileCompletionScore: Number(row.profile_completion_score || 0),
      claimedAt: row.claimed_at || null,
    }));

  return Response.json({
    ok: true,
    totalClaimed: rows.length,
    buckets,
    needsPhotoFollowup,
  });
}
