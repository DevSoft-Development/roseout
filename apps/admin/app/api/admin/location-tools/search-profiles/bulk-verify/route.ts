import { NextResponse } from "next/server";

import { getCurrentAdminOrNull } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import {
  safeSuggestedCorrections,
  summarizeReview,
  type ReviewProfile,
} from "@/lib/search/profile/profileReviewPolicy";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SELECTED = 500;

type RequestBody = {
  locationIds?: unknown;
  action?: unknown;
  override?: unknown;
  reason?: unknown;
};

type Detail = {
  locationId: string;
  outcome: "verified" | "corrected" | "skipped";
  severity: string;
  reasons: string[];
  removedFromReview: boolean;
};

async function requireBulkOperator() {
  const admin = await getCurrentAdminOrNull();
  if (!admin) {
    return {
      admin: null,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  if (!["superadmin", "admin"].includes(admin.role)) {
    return {
      admin: null,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }
  return { admin, response: null };
}

export async function POST(request: Request) {
  const auth = await requireBulkOperator();
  if (auth.response || !auth.admin) return auth.response;

  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const locationIds = Array.isArray(body.locationIds)
    ? [
        ...new Set(
          body.locationIds.filter(
            (value): value is string =>
              typeof value === "string" && UUID.test(value),
          ),
        ),
      ].slice(0, MAX_SELECTED)
    : [];

  const action = body.action === "apply_safe" ? "apply_safe" : "verify";
  const override = body.override === true;
  const reason =
    typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";

  if (!locationIds.length) {
    return NextResponse.json(
      { error: "Select at least one valid profile." },
      { status: 400 },
    );
  }

  if (override && auth.admin.role !== "superadmin") {
    return NextResponse.json(
      { error: "Only superadmins can override verification safeguards." },
      { status: 403 },
    );
  }

  if (override && reason.length < 10) {
    return NextResponse.json(
      { error: "A required override reason of at least 10 characters is required." },
      { status: 400 },
    );
  }

  const adminDb = getAdminDatabaseClient();
  const { data, error } = await adminDb
    .from("location_search_profiles")
    .select(
      "location_id,needs_review,confidence,profile_version,primary_domain,canonical_terms,review_reasons,supported_domains,restaurant_categories,activity_categories,nightlife_categories",
    )
    .in("location_id", locationIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as ReviewProfile[];
  const now = new Date().toISOString();
  const details: Detail[] = [];
  const verifyIds: string[] = [];
  let corrected = 0;

  for (const profile of rows) {
    const summary = summarizeReview(profile);
    const reasons = [
      ...summary.blockingReasons,
      ...summary.warningReasons,
    ];

    if (action === "apply_safe") {
      const suggestion = safeSuggestedCorrections(profile);

      if (!suggestion.canApply) {
        details.push({
          locationId: profile.location_id,
          outcome: "skipped",
          severity: summary.severity,
          reasons: reasons.length
            ? reasons
            : ["No deterministic safe correction available"],
          removedFromReview: false,
        });
        continue;
      }

      const correction = await adminDb
        .from("location_search_profiles")
        .update({
          primary_domain: suggestion.primaryDomain,
          canonical_terms: suggestion.canonicalTerms,
          needs_review: false,
          review_reasons: [],
          verified_at: now,
          verified_by: auth.admin.user_id,
          verification_source: "bulk_safe_correction",
          verification_note:
            "Applied deterministic safe correction from existing canonical profile fields.",
          updated_at: now,
        })
        .eq("location_id", profile.location_id);

      if (correction.error) {
        details.push({
          locationId: profile.location_id,
          outcome: "skipped",
          severity: summary.severity,
          reasons: [correction.error.message],
          removedFromReview: false,
        });
      } else {
        corrected += 1;
        details.push({
          locationId: profile.location_id,
          outcome: "corrected",
          severity: summary.severity,
          reasons,
          removedFromReview: true,
        });
      }
      continue;
    }

    const normallyEligible =
      summary.severity === "none" ||
      (summary.severity === "warning" &&
        summary.blockingReasons.length === 0);

    if (override || normallyEligible) {
      verifyIds.push(profile.location_id);
      details.push({
        locationId: profile.location_id,
        outcome: "verified",
        severity: summary.severity,
        reasons,
        removedFromReview: true,
      });
    } else {
      details.push({
        locationId: profile.location_id,
        outcome: "skipped",
        severity: summary.severity,
        reasons,
        removedFromReview: false,
      });
    }
  }

  if (verifyIds.length) {
    const update = await adminDb
      .from("location_search_profiles")
      .update({
        needs_review: false,
        review_reasons: [],
        verified_at: now,
        verified_by: auth.admin.user_id,
        verification_source: override ? "bulk_admin_override" : "bulk_admin",
        verification_note: override ? reason : null,
        updated_at: now,
      })
      .in("location_id", verifyIds);

    if (update.error) {
      return NextResponse.json(
        { error: update.error.message },
        { status: 500 },
      );
    }
  }

  const skippedDetails = details.filter(
    (item) => item.outcome === "skipped",
  );

  return NextResponse.json({
    verified: verifyIds.length,
    corrected,
    skipped: skippedDetails.length,
    removedFromReview: verifyIds.length + corrected,
    details,
    skippedDetails,
  });
}
