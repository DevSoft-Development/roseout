import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { evaluateGoogleDiscoveryCandidate } from "@/lib/location-growth/googleDiscoveryQuality";
import { publishReadyStagedLocations } from "@/lib/location-growth/publishReady";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE = "google_curated_discovery";
const REVIEW_ATTENTION_REASONS = new Set([
  "missing_rating",
  "missing_reviews",
  "rating_below_floor",
  "reviews_below_floor",
  "chain_or_qsr",
  "quick_service",
  "missing_location",
  "needs_photo",
  "needs_website",
  "needs_hours",
  "subjective_hidden_gem_requires_review",
  "quick_service_search_only",
  "weak_outing_evidence",
  "category_mismatch",
  "category_evidence_missing",
  "quality_score_below_curated_threshold",
]);

type ReviewAction = "approve_publish" | "keep_hidden" | "reject" | "re_evaluate" | "correct_category";
type Candidate = Record<string, any>;

function clean(value: unknown) {
  return String(value || "").trim();
}

function recordValue(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function hasHours(value: Record<string, any>) {
  return [value.opening_hours, value.current_opening_hours, value.regularOpeningHours, value.business_hours, value.hours, value.weekday_text]
    .some((candidate) => {
      if (!candidate) return false;
      if (Array.isArray(candidate)) return candidate.length > 0;
      if (typeof candidate === "object") return Object.keys(candidate).length > 0;
      return clean(candidate).length > 0;
    });
}

function toBoolean(value: unknown) {
  return value === true ? true : value === false ? false : null;
}

function reviewReasonFor(quality: ReturnType<typeof evaluateGoogleDiscoveryCandidate>) {
  const reasons = Array.from(new Set(quality.reasons.filter((reason) => REVIEW_ATTENTION_REASONS.has(reason))));
  if (reasons.length) return reasons.join(",");
  return quality.decision === "reject" ? "quality_score_below_curated_threshold" : "curated_manual_review";
}

function evaluateStoredCandidate(candidate: Candidate, categoryOverride?: string) {
  const raw = recordValue(candidate.raw_payload);
  const google = recordValue(raw.google);
  const gap = recordValue(raw.gap);
  const kind = candidate.location_type === "restaurant" ? "restaurant" : "activity";
  const category = clean(categoryOverride || gap.category || candidate.primary_tag || candidate.primary_category);
  const types = Array.isArray(google.types)
    ? google.types.map((value: unknown) => clean(value)).filter(Boolean)
    : Array.isArray(candidate.google_types)
      ? candidate.google_types
      : [];
  const photos = Array.isArray(google.photos) ? google.photos : [];
  const hasPhoto = Boolean(clean(candidate.main_image) || candidate.images?.length || photos.length);

  return evaluateGoogleDiscoveryCandidate({
    kind,
    name: clean(candidate.name || candidate.restaurant_name || candidate.activity_name),
    query: clean(raw.query),
    category,
    rating: Number(candidate.rating || google.rating || 0),
    reviewCount: Number(candidate.review_count || google.user_ratings_total || google.review_count || 0),
    types,
    editorialSummary: clean(google.editorial_summary?.overview) || null,
    hasPhoto,
    hasPhone: Boolean(clean(candidate.phone || google.formatted_phone_number || google.international_phone_number)),
    hasWebsite: Boolean(clean(candidate.website || google.website || google.websiteUri)),
    hasHours: hasHours(google),
    hasLocation: Boolean(clean(candidate.address) && clean(candidate.city) && clean(candidate.state) && Number.isFinite(Number(candidate.latitude)) && Number.isFinite(Number(candidate.longitude))),
    dineIn: toBoolean(google.dineIn),
    takeout: toBoolean(google.takeout),
    delivery: toBoolean(google.delivery),
    curbsidePickup: toBoolean(google.curbsidePickup),
    reservable: toBoolean(google.reservable),
    goodForGroups: toBoolean(google.goodForGroups),
    outdoorSeating: toBoolean(google.outdoorSeating),
    liveMusic: toBoolean(google.liveMusic),
    servesCocktails: toBoolean(google.servesCocktails),
    servesWine: toBoolean(google.servesWine),
  });
}

async function applyEvaluation(candidate: Candidate, categoryOverride?: string) {
  const quality = evaluateStoredCandidate(candidate, categoryOverride);
  const reason = reviewReasonFor(quality);
  const now = new Date().toISOString();

  if (quality.decision === "reject") {
    const { error } = await supabaseAdmin.from("location_import_staging").update({
      import_status: "rejected",
      quality_status: "reject",
      quality_score: quality.score,
      curation_tier: "rejected",
      public_visibility_tier: "hidden",
      source_quality_status: "curated_google_rejected",
      rejection_reason: reason,
      low_level_reason: reason,
      low_level_detected_at: now,
      low_level_source: "manual_google_discovery_review",
      updated_at: now,
    }).eq("id", candidate.id).eq("source", SOURCE);
    if (error) throw error;
    return { decision: quality.decision, quality };
  }

  if (quality.decision === "review") {
    const { error } = await supabaseAdmin.from("location_import_staging").update({
      import_status: "staged",
      quality_status: "review",
      quality_score: quality.score,
      public_visibility_tier: "standard",
      source_quality_status: "curated_google_review",
      rejection_reason: reason,
      updated_at: now,
    }).eq("id", candidate.id).eq("source", SOURCE);
    if (error) throw error;
    return { decision: quality.decision, quality };
  }

  const { error } = await supabaseAdmin.from("location_import_staging").update({
    import_status: "staged",
    quality_status: "publish_ready",
    quality_score: quality.score,
    curation_tier: "curated",
    public_visibility_tier: "standard",
    import_confidence: "high",
    source_quality_status: "curated_google",
    rejection_reason: null,
    updated_at: now,
  }).eq("id", candidate.id).eq("source", SOURCE);
  if (error) throw error;
  return { decision: quality.decision, quality };
}

export async function POST(request: NextRequest) {
  const { error: authError } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locationGrowth);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const action = body.action as ReviewAction;
  const ids = Array.from(new Set([
    ...(Array.isArray(body.ids) ? body.ids : []),
    ...(typeof body.id === "string" ? [body.id] : []),
  ].map((value) => String(value || "").trim()).filter(Boolean))).slice(0, 100);

  if (!ids.length || !["approve_publish", "keep_hidden", "reject", "re_evaluate", "correct_category"].includes(action)) {
    return NextResponse.json({ success: false, error: "A valid candidate selection and review action are required." }, { status: 400 });
  }
  if (action === "correct_category" && ids.length !== 1) {
    return NextResponse.json({ success: false, error: "Category correction can only be applied to one candidate at a time." }, { status: 400 });
  }

  const newCategory = clean(body.category).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (action === "correct_category" && !newCategory) {
    return NextResponse.json({ success: false, error: "Enter a valid corrected category." }, { status: 400 });
  }

  const { data: candidates, error: candidateError } = await supabaseAdmin
    .from("location_import_staging")
    .select("*")
    .eq("source", SOURCE)
    .in("id", ids);
  if (candidateError) return NextResponse.json({ success: false, error: candidateError.message }, { status: 500 });
  if ((candidates || []).length !== ids.length) return NextResponse.json({ success: false, error: "One or more selected candidates were not found." }, { status: 404 });

  const rows = (candidates || []) as Candidate[];
  const now = new Date().toISOString();

  try {
    if (action === "keep_hidden") {
      const { error } = await supabaseAdmin.from("location_import_staging").update({
        import_status: "hidden",
        quality_status: "review",
        public_visibility_tier: "hidden",
        is_low_level: false,
        low_level_reason: "manual_keep_hidden",
        low_level_source: "manual_google_discovery_review",
        rejection_reason: "manual_keep_hidden",
        updated_at: now,
      }).eq("source", SOURCE).in("id", ids);
      if (error) throw error;
      return NextResponse.json({ success: true, action, updated: ids.length });
    }

    if (action === "reject") {
      const { error } = await supabaseAdmin.from("location_import_staging").update({
        import_status: "rejected",
        quality_status: "reject",
        public_visibility_tier: "hidden",
        source_quality_status: "manual_review_rejected",
        rejection_reason: "manual_review_rejected",
        low_level_reason: "manual_review_rejected",
        low_level_source: "manual_google_discovery_review",
        low_level_detected_at: now,
        updated_at: now,
      }).eq("source", SOURCE).in("id", ids);
      if (error) throw error;
      return NextResponse.json({ success: true, action, updated: ids.length });
    }

    if (action === "correct_category") {
      const candidate = rows[0];
      const raw = recordValue(candidate.raw_payload);
      const gap = recordValue(raw.gap);
      const nextRawPayload = { ...raw, gap: { ...gap, category: newCategory } };
      const categoryUpdate: Record<string, unknown> = {
        primary_category: newCategory,
        raw_payload: nextRawPayload,
        updated_at: now,
      };
      if (candidate.location_type === "restaurant") categoryUpdate.cuisine = newCategory;
      else categoryUpdate.activity_type = newCategory;
      const { error } = await supabaseAdmin.from("location_import_staging").update(categoryUpdate).eq("id", candidate.id).eq("source", SOURCE);
      if (error) throw error;
      const result = await applyEvaluation({ ...candidate, ...categoryUpdate }, newCategory);
      return NextResponse.json({ success: true, action, category: newCategory, evaluation: result.quality, decision: result.decision });
    }

    if (action === "re_evaluate") {
      const results = [];
      for (const candidate of rows) results.push({ id: candidate.id, ...(await applyEvaluation(candidate)) });
      return NextResponse.json({ success: true, action, updated: results.length, results });
    }

    for (const candidate of rows) {
      if (candidate.duplicate_status === "duplicate" || candidate.duplicate_status === "possible_duplicate") {
        return NextResponse.json({ success: false, error: `${candidate.name || "A selected candidate"} has an unresolved duplicate state.` }, { status: 409 });
      }
      if (!candidate.has_photos || candidate.photo_status === "missing_photo" || !candidate.address || candidate.latitude == null || candidate.longitude == null || !candidate.primary_category) {
        return NextResponse.json({ success: false, error: `${candidate.name || "A selected candidate"} is missing a required publishability field.` }, { status: 409 });
      }
    }

    const { error: approveError } = await supabaseAdmin.from("location_import_staging").update({
      import_status: "staged",
      quality_status: "publish_ready",
      public_visibility_tier: "standard",
      is_low_level: false,
      low_level_reason: null,
      low_level_source: "manual_google_discovery_review",
      import_confidence: "high",
      source_quality_status: "manual_review_approved",
      rejection_reason: null,
      updated_at: now,
    }).eq("source", SOURCE).in("id", ids);
    if (approveError) throw approveError;

    const batchIds = Array.from(new Set(rows.map((candidate) => clean(candidate.batch_id)).filter(Boolean)));
    let published = 0;
    let inserted = 0;
    const publishErrors: string[] = [];
    for (const batchId of batchIds) {
      const selectedInBatch = rows.filter((candidate) => candidate.batch_id === batchId).length;
      const result = await publishReadyStagedLocations({ batchId, limit: Math.max(selectedInBatch, 1) });
      published += result.markedPublished;
      inserted += result.inserted;
      publishErrors.push(...result.errors);
    }

    return NextResponse.json({ success: true, action, approved: ids.length, published, inserted, publishErrors });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Review action failed." }, { status: 500 });
  }
}
