import { handleOptions } from "../_shared/cors.ts";
import { ok, serverError } from "../_shared/response.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { requireAdminOrCron } from "../_shared/auth.ts";
import { hasValidPhoto } from "../_shared/photos.ts";
import { logEdgeFunctionRun, safeError, startTimer } from "../_shared/logger.ts";
async function findPhoto(location: any) {
  const key = Deno.env.get("GOOGLE_PLACES_API_KEY");
  if (!key) return { skipped: true, reason: "GOOGLE_PLACES_API_KEY missing" };
  let placeId = location.place_id;
  if (!placeId) {
    const q = encodeURIComponent([location.name || location.restaurant_name || location.activity_name, location.address, location.city].filter(Boolean).join(" "));
    const res = await fetch(`https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${q}&inputtype=textquery&fields=place_id&key=${key}`);
    placeId = (await res.json()).candidates?.[0]?.place_id;
  }
  if (!placeId) return { skipped: true, reason: "place_id not found" };
  const details = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${key}`);
  const ref = (await details.json()).result?.photos?.[0]?.photo_reference;
  if (!ref) return { skipped: true, reason: "photo reference not found" };
  return { photoUrl: `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${encodeURIComponent(ref)}&key=${key}` };
}
Deno.serve(async (req) => {
  const options = handleOptions(req); if (options) return options;
  const timer = startTimer(); const supabase = createSupabaseAdminClient();
  try {
    const auth = await requireAdminOrCron(req, supabase);
    const body = await req.json().catch(() => ({})); const batchSize = Math.min(Math.max(Number(body.batchSize ?? 25), 1), 100); const dryRun = Boolean(body.dryRun);
    const { data } = await supabase.from("locations").select("*").or("has_photos.is.false,has_photos.is.null,photo_status.eq.missing_photo,image_url.is.null").limit(batchSize * 2);
    const candidates = (data ?? []).filter((row: any) => !hasValidPhoto(row)).slice(0, batchSize);
    let updated = 0, skipped = 0, failed = 0;
    for (const location of candidates) {
      try { const photo = await findPhoto(location); if ((photo as any).photoUrl && !dryRun) { await supabase.from("locations").update({ image_url: (photo as any).photoUrl, photo_url: (photo as any).photoUrl, has_photos: true, photo_status: "has_photo", updated_at: new Date().toISOString() }).eq("id", location.id); updated++; } else skipped++; } catch { failed++; }
    }
    await supabase.from("cron_job_runs").insert({ job_name: "nightly-photo-backfill", status: failed ? "partial" : "success", finished_at: new Date().toISOString(), duration_ms: timer(), checked_count: candidates.length, success_count: updated, skipped_count: skipped, failed_count: failed, success_rate: candidates.length ? updated / candidates.length : null, metadata: { dryRun, source: auth.source } });
    await logEdgeFunctionRun(supabase, { function_name: "nightly-photo-backfill", status: "success", source: auth.source, duration_ms: timer(), output_summary: { checked: candidates.length, updated, skipped, failed } });
    return ok({ success: true, checked: candidates.length, updated, skipped, failed, dryRun, googlePlacesAvailable: Boolean(Deno.env.get("GOOGLE_PLACES_API_KEY")) });
  } catch (error) { await logEdgeFunctionRun(supabase, { function_name: "nightly-photo-backfill", status: "error", error_message: safeError(error), duration_ms: timer() }); return serverError("nightly-photo-backfill failed", safeError(error)); }
});
