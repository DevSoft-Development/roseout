import { NextResponse } from "next/server";

import { getCurrentAdminOrNull } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { LOCATION_SEARCH_PROFILE_FIELDS } from "@/lib/admin/location-data-projections";
import {
  refreshLocationSearchProfile,
} from "@/lib/search/profile/profileRepository";
import type {
  ManualProfileOverrides,
  ProfileFacet,
  SearchDomain,
} from "@/lib/search/profile/profileTypes";

const DOMAINS = new Set<SearchDomain>(["restaurant", "activity", "nightlife"]);
const FACETS = new Set<ProfileFacet>([
  "supportedDomains",
  "restaurantCategories",
  "cuisines",
  "foods",
  "activityCategories",
  "nightlifeCategories",
  "mealPeriods",
  "features",
  "audiences",
  "occasions",
  "vibes",
  "canonicalTerms",
]);

function cleanFacetMap(
  value: unknown,
): Partial<Record<ProfileFacet, string[]>> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  const result: Partial<Record<ProfileFacet, string[]>> = {};
  for (const [key, entries] of Object.entries(value)) {
    if (!FACETS.has(key as ProfileFacet) || !Array.isArray(entries)) continue;
    const cleaned = [
      ...new Set(
        entries
          .filter((entry): entry is string => typeof entry === "string")
          .map((entry) => entry.trim())
          .filter(Boolean),
      ),
    ].slice(0, 100);
    if (cleaned.length) result[key as ProfileFacet] = cleaned;
  }

  return Object.keys(result).length ? result : undefined;
}

async function requireProfileOperator() {
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ locationId: string }> },
) {
  const auth = await requireProfileOperator();
  if (auth.response || !auth.admin) return auth.response;

  const { locationId } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  const primaryDomain =
    typeof body.primaryDomain === "string" &&
    DOMAINS.has(body.primaryDomain as SearchDomain)
      ? (body.primaryDomain as SearchDomain)
      : undefined;
  const note =
    typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";

  const overrides: ManualProfileOverrides = {
    primaryDomain,
    add: cleanFacetMap(body.add),
    remove: cleanFacetMap(body.remove),
  };

  try {
    const profile = await refreshLocationSearchProfile(
      locationId,
      "admin_review_apply",
      overrides,
    );
    const now = new Date().toISOString();
    const update = await getAdminDatabaseClient()
      .from("location_search_profiles")
      .update({
        needs_review: false,
        review_reasons: [],
        verified_at: now,
        verified_by: auth.admin.user_id,
        verification_source: "admin_review_apply",
        verification_note: note || null,
        updated_at: now,
      })
      .eq("location_id", locationId)
      .select(LOCATION_SEARCH_PROFILE_FIELDS)
      .single();

    if (update.error) throw new Error(update.error.message);
    return NextResponse.json({ profile: update.data ?? profile });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Profile review could not be applied.",
      },
      { status: 500 },
    );
  }
}
