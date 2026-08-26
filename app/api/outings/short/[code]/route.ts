import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { trackEvent } from "@/lib/analytics/trackEvent";
import { buildShortLinkUrl, normalizeShortCode } from "@/lib/outings/short-links";

type JsonRecord = Record<string, unknown>;
type SnapshotPair = {
  rank?: number | null;
  restaurant_location_id?: string | null;
  activity_location_id?: string | null;
  pair_distance_miles?: number | null;
};
type SnapshotResult = {
  rank?: number | null;
  location_id?: string | null;
  location_type?: string | null;
};

const LOCATION_SELECT = [
  "id",
  "location_type",
  "restaurant_name",
  "activity_name",
  "name",
  "address",
  "city",
  "state",
  "zip_code",
  "cuisine",
  "cuisine_type",
  "activity_type",
  "primary_category",
  "reservation_url",
  "booking_url",
  "website",
  "phone",
  "image_url",
  "rating",
  "review_count",
  "source_table",
  "main_image",
  "external_reservation_url",
  "google_rating",
].join(",");

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isExpired(value: unknown) {
  return typeof value === "string" && value && new Date(value).getTime() < Date.now();
}

async function loadOuting(code: string) {
  const admin = getSupabaseAdminClient();
  return admin
    .from("outings")
    .select("id,user_id,status,location_id,source_location_id,source_query,source_search_id,plan_title,restaurant_location_id,activity_location_id,planned_for,timezone,outing_date_context,outing_time_confidence,reminders_enabled,plan_access_token,plan_access_token_expires_at,metadata")
    .eq("metadata->>short_code", code)
    .maybeSingle();
}

function snapshotFrom(outing: JsonRecord) {
  const metadata = asRecord(outing.metadata);
  return asRecord(metadata.planner_snapshot);
}

function allowedLocationIds(snapshot: JsonRecord) {
  const ids = new Set<string>();
  for (const pair of asArray<SnapshotPair>(snapshot.pair_ids)) {
    if (asString(pair.restaurant_location_id)) ids.add(String(pair.restaurant_location_id));
    if (asString(pair.activity_location_id)) ids.add(String(pair.activity_location_id));
  }
  for (const result of asArray<SnapshotResult>(snapshot.result_ids)) {
    if (asString(result.location_id)) ids.add(String(result.location_id));
  }
  return ids;
}

async function loadLocations(ids: string[]): Promise<JsonRecord[]> {
  if (!ids.length) return [];
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.from("locations").select(LOCATION_SELECT).in("id", ids);
  if (error) throw error;
  return (data || []) as unknown as JsonRecord[];
}

function buildSnapshotResponse(outing: JsonRecord, code: string, locations: JsonRecord[]) {
  const snapshot = snapshotFrom(outing);
  const locationMap = new Map(locations.map((location) => [String(location.id), location]));
  const pairRows = asArray<SnapshotPair>(snapshot.pair_ids);
  const resultRows = asArray<SnapshotResult>(snapshot.result_ids);

  const pairs = pairRows
    .map((pair, index) => {
      const restaurantId = asString(pair.restaurant_location_id);
      const activityId = asString(pair.activity_location_id);
      if (!restaurantId || !activityId) return null;
      const restaurant = locationMap.get(restaurantId);
      const activity = locationMap.get(activityId);
      if (!restaurant || !activity) return null;
      return {
        rank: Number(pair.rank) || index + 1,
        distanceMiles: Number.isFinite(Number(pair.pair_distance_miles)) ? Number(pair.pair_distance_miles) : null,
        restaurant,
        activity,
      };
    })
    .filter(Boolean);

  const restaurants: JsonRecord[] = [];
  const activities: JsonRecord[] = [];
  const restaurantSeen = new Set<string>();
  const activitySeen = new Set<string>();

  for (const result of resultRows) {
    const id = asString(result.location_id);
    if (!id) continue;
    const location = locationMap.get(id);
    if (!location) continue;
    const type = String(result.location_type || location.location_type || "").toLowerCase();
    if (type === "restaurant" && !restaurantSeen.has(id)) {
      restaurantSeen.add(id);
      restaurants.push(location);
    } else if (type === "activity" && !activitySeen.has(id)) {
      activitySeen.add(id);
      activities.push(location);
    }
  }

  for (const pair of pairs as Array<{ restaurant: JsonRecord; activity: JsonRecord }>) {
    const restaurantId = String(pair.restaurant.id);
    const activityId = String(pair.activity.id);
    if (!restaurantSeen.has(restaurantId)) {
      restaurantSeen.add(restaurantId);
      restaurants.push(pair.restaurant);
    }
    if (!activitySeen.has(activityId)) {
      activitySeen.add(activityId);
      activities.push(pair.activity);
    }
  }

  return {
    ok: true,
    code,
    shortUrl: buildShortLinkUrl(code),
    planTitle: asString(outing.plan_title) || "Your TheOutHaven Plan",
    prompt: asString(snapshot.source_query) || asString(outing.source_query) || "",
    planType: asString(snapshot.plan_type) || (outing.restaurant_location_id && outing.activity_location_id ? "outing" : outing.restaurant_location_id ? "restaurant" : "activity"),
    selected: {
      restaurantLocationId: asString(outing.restaurant_location_id),
      activityLocationId: asString(outing.activity_location_id),
    },
    timing: {
      plannedFor: outing.planned_for || null,
      timezone: asString(outing.timezone) || "America/New_York",
      outingDateContext: outing.outing_date_context || null,
      outingTimeConfidence: outing.outing_time_confidence || "none",
      remindersEnabled: Boolean(outing.reminders_enabled),
    },
    snapshot: {
      version: asString(snapshot.version) || "guided_results_snapshot_v1",
      searchEventId: snapshot.search_event_id ?? null,
      createdAt: snapshot.search_event_created_at ?? null,
    },
    pairs,
    restaurants,
    activities,
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code: rawCode } = await params;
    const code = normalizeShortCode(rawCode);
    if (!code) return NextResponse.json({ ok: false, error: "invalid_short_code" }, { status: 400 });

    const { data: outing, error } = await loadOuting(code);
    if (error || !outing) return NextResponse.json({ ok: false, error: "plan_not_found" }, { status: 404 });
    if (isExpired(outing.plan_access_token_expires_at)) return NextResponse.json({ ok: false, error: "plan_link_expired" }, { status: 410 });

    const snapshot = snapshotFrom(outing as JsonRecord);
    const ids = allowedLocationIds(snapshot);
    if (asString(outing.restaurant_location_id)) ids.add(String(outing.restaurant_location_id));
    if (asString(outing.activity_location_id)) ids.add(String(outing.activity_location_id));
    const locations = await loadLocations([...ids]);

    await trackEvent({
      event_name: "planner_results_revisited",
      event_type: "planner",
      outing_id: outing.id,
      source: "short_link",
      query: asString(outing.source_query),
      metadata: {
        short_code: code,
        pair_count: asArray(snapshot.pair_ids).length,
        result_count: asArray(snapshot.result_ids).length,
      },
    }).catch(() => undefined);

    return NextResponse.json(buildSnapshotResponse(outing as JsonRecord, code, locations));
  } catch (error) {
    console.error("OUTING_SHORT_SNAPSHOT_GET_FAILED", error);
    return NextResponse.json({ ok: false, error: "snapshot_load_failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code: rawCode } = await params;
    const code = normalizeShortCode(rawCode);
    if (!code) return NextResponse.json({ ok: false, error: "invalid_short_code" }, { status: 400 });

    const { data: outing, error } = await loadOuting(code);
    if (error || !outing) return NextResponse.json({ ok: false, error: "plan_not_found" }, { status: 404 });
    if (isExpired(outing.plan_access_token_expires_at)) return NextResponse.json({ ok: false, error: "plan_link_expired" }, { status: 410 });

    const body = await req.json();
    const restaurantLocationId = asString(body.restaurantLocationId);
    const activityLocationId = asString(body.activityLocationId);
    const snapshot = snapshotFrom(outing as JsonRecord);
    const allowed = allowedLocationIds(snapshot);

    if (restaurantLocationId && !allowed.has(restaurantLocationId)) {
      return NextResponse.json({ ok: false, error: "restaurant_not_in_snapshot" }, { status: 400 });
    }
    if (activityLocationId && !allowed.has(activityLocationId)) {
      return NextResponse.json({ ok: false, error: "activity_not_in_snapshot" }, { status: 400 });
    }
    if (!restaurantLocationId && !activityLocationId) {
      return NextResponse.json({ ok: false, error: "pick_required" }, { status: 400 });
    }

    const selectedIds = [restaurantLocationId, activityLocationId].filter((value): value is string => Boolean(value));
    const selectedLocations = await loadLocations(selectedIds);
    const locationMap = new Map(selectedLocations.map((location) => [String(location.id), location]));
    if (selectedLocations.length !== selectedIds.length) {
      return NextResponse.json({ ok: false, error: "selected_location_missing" }, { status: 400 });
    }

    const metadata = asRecord(outing.metadata);
    const nextSnapshot = {
      ...snapshot,
      selected_restaurant_location_id: restaurantLocationId,
      selected_activity_location_id: activityLocationId,
      last_pick_changed_at: new Date().toISOString(),
    };
    const nextMetadata = {
      ...metadata,
      planner_snapshot: nextSnapshot,
      selected_locations: {
        restaurant: restaurantLocationId ? locationMap.get(restaurantLocationId) || null : null,
        activity: activityLocationId ? locationMap.get(activityLocationId) || null : null,
      },
    };

    const primaryLocationId = restaurantLocationId || activityLocationId;
    const admin = getSupabaseAdminClient();
    const { data: updated, error: updateError } = await admin
      .from("outings")
      .update({
        restaurant_location_id: restaurantLocationId,
        activity_location_id: activityLocationId,
        location_id: primaryLocationId,
        metadata: nextMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", outing.id)
      .select("id,restaurant_location_id,activity_location_id")
      .single();

    if (updateError) throw updateError;

    await trackEvent({
      event_name: "planner_pick_changed",
      event_type: "planner",
      outing_id: outing.id,
      source: "snapshot_results",
      query: asString(outing.source_query),
      metadata: {
        short_code: code,
        previous_restaurant_location_id: outing.restaurant_location_id || null,
        previous_activity_location_id: outing.activity_location_id || null,
        restaurant_location_id: restaurantLocationId,
        activity_location_id: activityLocationId,
        result_type: asString(body.resultType) || "saved_result_change",
      },
    }).catch(() => undefined);

    return NextResponse.json({
      ok: true,
      outing: updated,
      planUrl: buildShortLinkUrl(code),
      selected: { restaurantLocationId, activityLocationId },
    });
  } catch (error) {
    console.error("OUTING_SHORT_SNAPSHOT_PATCH_FAILED", error);
    return NextResponse.json({ ok: false, error: "pick_update_failed" }, { status: 500 });
  }
}
