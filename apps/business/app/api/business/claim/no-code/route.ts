import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyCaptcha } from "@/lib/security/verifyCaptcha";
import { getClientIpHash } from "@/lib/security/turnstile";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase-server";
import { normalizeAddressForSave } from "@/lib/address-utils";
import {
  sendAdminNewClaimEmail,
  sendNoCodeMatchedClaimEmail,
  sendNoCodeNewLocationClaimEmail,
} from "@/lib/notifications";

export const dynamic = "force-dynamic";

type LocationRow = {
  id: string;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  borough?: string | null;
  phone?: string | null;
  website?: string | null;
  location_type?: string | null;
  primary_category?: string | null;
  claim_status?: string | null;
  owner_user_id?: string | null;
  is_claimed?: boolean | null;
  claimed?: boolean | null;
};

const LOCATION_SELECT =
  "id,name,restaurant_name,activity_name,address,city,state,zip_code,borough,phone,website,location_type,primary_category,claim_status,is_claimed,claimed,owner_user_id";

const LOCATION_TYPE_OPTIONS = new Set([
  "Restaurant",
  "Lounge",
  "Bar",
  "Cafe",
  "Dessert Spot",
  "Activity",
  "Entertainment",
  "Event Space",
  "Wellness",
  "Other",
]);

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function lower(value: unknown) {
  return clean(value).toLowerCase();
}

function phoneDigits(value: unknown) {
  return clean(value).replace(/\D/g, "");
}

function normalizeWebsite(value: unknown) {
  return lower(value)
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
}

function optionalNumber(value: string) {
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compactName(row: LocationRow) {
  return (
    row.name ||
    row.restaurant_name ||
    row.activity_name ||
    "TheOutHaven location"
  );
}

function tokenSet(value: string) {
  return new Set(value.split(/[^a-z0-9]+/).filter((part) => part.length > 2));
}

function similarity(a: string, b: string) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  left.forEach((token) => {
    if (right.has(token)) shared += 1;
  });
  return shared / Math.max(left.size, right.size);
}

function snapshot(row: LocationRow) {
  return {
    id: row.id,
    name: compactName(row),
    address: row.address || null,
    city: row.city || row.borough || null,
    state: row.state || null,
    zipCode: row.zip_code || null,
    phone: row.phone || null,
    website: row.website || null,
    locationType: row.location_type || null,
    primaryCategory: row.primary_category || null,
    claimStatus: row.claim_status || null,
    isClaimed: Boolean(
      row.is_claimed ||
        row.claimed ||
        row.owner_user_id ||
        lower(row.claim_status) === "approved",
    ),
  };
}

async function findBestMatch(input: {
  locationName: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  website: string;
}) {
  const phone = input.phone;
  const queries: any[] = [];

  if (phone)
    queries.push(
      supabaseAdmin
        .from("locations")
        .select(LOCATION_SELECT)
        .ilike("phone", `%${phone.slice(-7)}%`)
        .limit(10),
    );
  if (input.zipCode)
    queries.push(
      supabaseAdmin
        .from("locations")
        .select(LOCATION_SELECT)
        .eq("zip_code", input.zipCode)
        .ilike("address", input.address)
        .limit(10),
    );
  if (input.city && input.state) {
    const firstNameToken =
      input.locationName.split(" ")[0] || input.locationName;
    queries.push(
      supabaseAdmin
        .from("locations")
        .select(LOCATION_SELECT)
        .ilike("city", input.city)
        .ilike("state", input.state)
        .ilike("name", `%${firstNameToken}%`)
        .limit(20),
    );
    queries.push(
      supabaseAdmin
        .from("locations")
        .select(LOCATION_SELECT)
        .ilike("city", input.city)
        .ilike("state", input.state)
        .ilike("restaurant_name", `%${firstNameToken}%`)
        .limit(20),
    );
    queries.push(
      supabaseAdmin
        .from("locations")
        .select(LOCATION_SELECT)
        .ilike("city", input.city)
        .ilike("state", input.state)
        .ilike("activity_name", `%${firstNameToken}%`)
        .limit(20),
    );
  }
  if (input.website)
    queries.push(
      supabaseAdmin
        .from("locations")
        .select(LOCATION_SELECT)
        .ilike("website", `%${input.website}%`)
        .limit(10),
    );

  const results = await Promise.all(queries);
  const candidates = new Map<string, LocationRow>();
  for (const result of results) {
    if (result.error) throw result.error;
    for (const row of result.data || []) candidates.set(row.id, row);
  }

  let best: {
    row: LocationRow;
    score: number;
    status: "exact_match" | "possible_match" | "no_match" | "pending_review";
  } | null = null;
  for (const row of candidates.values()) {
    const rowPhone = phoneDigits(row.phone);
    const rowAddress = lower(row.address);
    const rowZip = clean(row.zip_code);
    const rowName = lower(compactName(row));
    const rowCity = lower(row.city || row.borough);
    const rowState = lower(row.state);
    const rowWebsite = normalizeWebsite(row.website);
    const nameSimilarity = similarity(input.locationName, rowName);

    let score = 0;
    if (
      phone &&
      rowPhone &&
      (rowPhone === phone || rowPhone.endsWith(phone.slice(-7)))
    )
      score += 45;
    if (
      input.address &&
      rowAddress === input.address &&
      input.zipCode &&
      rowZip === input.zipCode
    )
      score += 45;
    if (
      input.locationName &&
      rowName === input.locationName &&
      rowCity === input.city &&
      rowState === input.state
    )
      score += 35;
    if (
      nameSimilarity >= 0.6 &&
      phone &&
      rowPhone &&
      rowPhone.endsWith(phone.slice(-7))
    )
      score += 35;
    if (
      nameSimilarity >= 0.6 &&
      input.address &&
      rowAddress.includes(input.address.slice(0, 10))
    )
      score += 30;
    if (input.website && rowWebsite && rowWebsite === input.website)
      score += 25;

    const status:
      "exact_match" | "possible_match" | "no_match" | "pending_review" =
      score >= 80
        ? "exact_match"
        : score >= 45
          ? "possible_match"
          : score > 0
            ? "pending_review"
            : "no_match";
    if (!best || score > best.score) best = { row, score, status };
  }

  if (!best || best.status === "pending_review" || best.status === "no_match") {
    const fallbackBest = best as {
      score: number;
      status: "exact_match" | "possible_match" | "no_match" | "pending_review";
    } | null;
    return {
      row: null,
      confidenceScore: fallbackBest?.score || null,
      matchStatus: fallbackBest?.status || ("no_match" as const),
    };
  }

  return {
    row: best.row,
    confidenceScore: best.score,
    matchStatus: best.status,
  };
}

async function maybeSendEmails(args: {
  ownerEmail: string;
  contactName: string;
  locationName: string;
  matched: boolean;
  requestType: string;
  phone: string;
  matchStatus: string;
  verificationStatus: string;
  planInterest: string;
  createdAt?: string | null;
  claimRequestId?: string | null;
}) {
  const createdAt = args.createdAt ? new Date(args.createdAt).getTime() : 0;
  const olderThan24Hours =
    !createdAt || Date.now() - createdAt > 24 * 60 * 60 * 1000;
  if (!olderThan24Hours) return;

  await Promise.allSettled([
    args.matched
      ? sendNoCodeMatchedClaimEmail({
          email: args.ownerEmail,
          contactName: args.contactName,
          locationName: args.locationName,
          claimRequestId: args.claimRequestId,
        })
      : sendNoCodeNewLocationClaimEmail({
          email: args.ownerEmail,
          contactName: args.contactName,
          locationName: args.locationName,
          claimRequestId: args.claimRequestId,
        }),
    sendAdminNewClaimEmail({
      locationName: args.locationName,
      requestType: args.requestType,
      contactNameOrOwnerName: args.contactName,
      businessEmail: args.ownerEmail,
      phone: args.phone,
      matchStatus: args.matchStatus,
      verificationStatus: args.verificationStatus,
      planInterest: args.planInterest,
      claimRequestId: args.claimRequestId,
    }),
  ]);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const required = [
      "locationName",
      "address",
      "city",
      "state",
      "zipCode",
      "phone",
      "locationType",
      "businessEmail",
      "contactName",
      "roleAtBusiness",
    ];
    for (const field of required) {
      if (!clean(body[field]))
        return Response.json(
          { ok: false, error: `missing_${field}` },
          { status: 400 },
        );
    }

    const authSupabase = await createClient();
    const { data: userData } = await authSupabase.auth.getUser();
    const user = userData.user;
    if (!user?.id || !user.email) {
      return Response.json(
        { ok: false, error: "auth_required" },
        { status: 401 },
      );
    }

    if (!user.email_confirmed_at && !user.confirmed_at) {
      return Response.json(
        { ok: false, error: "email_verification_required" },
        { status: 403 },
      );
    }

    const ipHash = getClientIpHash(req);
    const attemptLimit = await enforceRateLimit(
      `business-claim:${user.id}:${ipHash}`,
      5,
      10 * 60_000,
    );
    if (!attemptLimit.ok) {
      return Response.json(
        { ok: false, error: "claim_rate_limited" },
        {
          status: 429,
          headers: {
            "Retry-After": String(attemptLimit.retryAfterSeconds || 600),
          },
        },
      );
    }

    const captchaToken = clean(body.captchaToken);
    const forwardedFor = req.headers
      .get("x-forwarded-for")
      ?.split(",")[0]
      ?.trim();
    const captcha = await verifyCaptcha(captchaToken, forwardedFor);

    if (!captcha.success) {
      return Response.json(
        { ok: false, error: "captcha_failed" },
        { status: 400 },
      );
    }

    let locationNameRaw = clean(body.locationName);
    let addressRaw = clean(body.address);
    let cityRaw = clean(body.city);
    let stateRaw = clean(body.state);
    let zipCode = clean(body.zipCode);
    let normalizedAddress = normalizeAddressForSave({
      address: addressRaw,
      city: cityRaw,
      state: stateRaw,
      zip_code: zipCode,
    });
    let phoneRaw = clean(body.phone);
    let ownerPhone = phoneDigits(phoneRaw);
    const locationTypeRaw = clean(body.locationType);
    if (!LOCATION_TYPE_OPTIONS.has(locationTypeRaw)) {
      return Response.json(
        { ok: false, error: "missing_locationType" },
        { status: 400 },
      );
    }
    let locationType = locationTypeRaw;
    const ownerEmail = lower(body.businessEmail);
    if (ownerEmail !== lower(user.email)) {
      return Response.json(
        { ok: false, error: "email_must_match_account" },
        { status: 403 },
      );
    }
    const contactName = clean(body.contactName);
    const roleAtBusiness = clean(body.roleAtBusiness);
    const ownershipAttested = body.ownershipAttested === true;
    if (!ownershipAttested) {
      return Response.json(
        { ok: false, error: "ownership_evidence_required" },
        { status: 400 },
      );
    }
    let websiteRaw = clean(body.website);
    const planInterest =
      clean(body.planInterest) === "pro" ? "pro" : "free_discovery";
    const planInterval = clean(body.planInterval) === "annual" ? "annual" : "monthly";
    const selectedLocationId = clean(body.selectedLocationId);
    const notes = clean(body.notes);
    const neighborhood = clean(body.neighborhood);
    const latitude = clean(body.latitude);
    const longitude = clean(body.longitude);
    const googlePlaceId = clean(body.googlePlaceId);
    const formattedAddress = clean(body.formattedAddress);

    let selectedLocation: LocationRow | null = null;
    if (selectedLocationId) {
      const { data, error } = await supabaseAdmin
        .from("locations")
        .select(LOCATION_SELECT)
        .eq("id", selectedLocationId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return Response.json({ ok: false, error: "location_not_found" }, { status: 404 });
      }
      selectedLocation = data;
      if (snapshot(selectedLocation).isClaimed) {
        return Response.json({ ok: false, error: "location_already_claimed" }, { status: 409 });
      }
      locationNameRaw = compactName(selectedLocation);
      addressRaw = clean(selectedLocation.address) || addressRaw;
      cityRaw = clean(selectedLocation.city || selectedLocation.borough) || cityRaw;
      stateRaw = clean(selectedLocation.state) || stateRaw;
      zipCode = clean(selectedLocation.zip_code) || zipCode;
      phoneRaw = clean(selectedLocation.phone) || phoneRaw;
      ownerPhone = phoneDigits(phoneRaw);
      websiteRaw = clean(selectedLocation.website) || websiteRaw;
      locationType =
        lower(selectedLocation.location_type).includes("restaurant")
          ? "Restaurant"
          : "Activity";
      normalizedAddress = normalizeAddressForSave({
        address: addressRaw,
        city: cityRaw,
        state: stateRaw,
        zip_code: zipCode,
      });
    }

    const match = selectedLocation
      ? { row: selectedLocation, confidenceScore: 100, matchStatus: "exact_match" as const }
      : await findBestMatch({
          locationName: lower(locationNameRaw),
          address: lower(addressRaw),
          city: lower(cityRaw),
          state: lower(stateRaw),
          zipCode,
          phone: ownerPhone,
          website: normalizeWebsite(websiteRaw),
        });

    if (match.row && snapshot(match.row).isClaimed) {
      return Response.json(
        { ok: false, error: "location_already_claimed" },
        { status: 409 },
      );
    }

    const matchedExistingLocation = Boolean(match.row);
    const verificationStatus = matchedExistingLocation
      ? "background_matched"
      : "needs_admin_match";
    const matchedLocationSnapshot = match.row ? snapshot(match.row) : null;

    const duplicateChecks = [
      supabaseAdmin
        .from("location_claim_requests")
        .select("id, created_at, location_id")
        .in("status", ["pending", "needs_more_info", "approved"])
        .eq("owner_email", ownerEmail)
        .eq("owner_phone", ownerPhone || phoneRaw)
        .limit(1),
      supabaseAdmin
        .from("location_claim_requests")
        .select("id, created_at, location_id")
        .in("status", ["pending", "needs_more_info"])
        .eq("location_name", locationNameRaw)
        .eq("address", normalizedAddress)
        .eq("owner_phone", ownerPhone || phoneRaw)
        .limit(1),
    ];

    if (match.row?.id) {
      duplicateChecks.push(
        supabaseAdmin
          .from("location_claim_requests")
          .select("id, created_at, location_id")
          .in("status", ["pending", "needs_more_info", "approved"])
          .eq("location_id", match.row.id)
          .eq("owner_email", ownerEmail)
          .limit(1),
      );
    }

    const duplicateResults = await Promise.all(duplicateChecks);
    for (const result of duplicateResults) {
      if (result.error) throw result.error;
    }
    const duplicate = duplicateResults.flatMap(
      (result) => result.data || [],
    )[0];
    if (duplicate) {
      await maybeSendEmails({
        ownerEmail,
        contactName,
        locationName: locationNameRaw,
        matched: Boolean(duplicate.location_id || matchedExistingLocation),
        requestType: "No-code business claim",
        phone: phoneRaw,
        matchStatus: match.matchStatus,
        verificationStatus,
        planInterest,
        createdAt: duplicate.created_at,
      });
      return Response.json({
        ok: true,
        claimRequestId: duplicate.id,
        matchedExistingLocation: Boolean(
          duplicate.location_id || matchedExistingLocation,
        ),
        message:
          "Your claim has been submitted for review. Once approved, you’ll be able to access your location dashboard and add details such as photos, descriptions, hours, contact information, and plan options.",
      });
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [ownerAccess, openClaims, dailyUserClaims, dailyIpClaims] =
      await Promise.all([
        supabaseAdmin
          .from("location_owner_locations")
          .select("id")
          .eq("user_id", user.id)
          .eq("status", "active")
          .limit(1),
        supabaseAdmin
          .from("location_claim_requests")
          .select("id")
          .eq("user_id", user.id)
          .in("status", ["pending", "needs_more_info"])
          .limit(6),
        supabaseAdmin
          .from("location_claim_requests")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("created_at", since),
        supabaseAdmin
          .from("location_claim_requests")
          .select("id", { count: "exact", head: true })
          .eq("submission_ip_hash", ipHash)
          .gte("created_at", since),
      ]);

    for (const result of [
      ownerAccess,
      openClaims,
      dailyUserClaims,
      dailyIpClaims,
    ]) {
      if (result.error) throw result.error;
    }

    const establishedOwner = Boolean(ownerAccess.data?.length);
    const openClaimCount = openClaims.data?.length || 0;
    if ((!establishedOwner && openClaimCount >= 1) || openClaimCount >= 5) {
      return Response.json(
        { ok: false, error: "active_claim_limit" },
        { status: 409 },
      );
    }
    if (
      (dailyUserClaims.count || 0) >= 5 ||
      (dailyIpClaims.count || 0) >= 5
    ) {
      return Response.json(
        { ok: false, error: "claim_rate_limited" },
        { status: 429, headers: { "Retry-After": "86400" } },
      );
    }

    const now = new Date().toISOString();
    const { data: claim, error } = await supabaseAdmin
      .from("location_claim_requests")
      .insert({
        location_name: locationNameRaw,
        location_type: locationType,
        request_type: "No-code business claim",
        website: websiteRaw || null,
        address: normalizedAddress || null,
        city: cityRaw,
        state: stateRaw,
        zip_code: zipCode,
        neighborhood: neighborhood || null,
        latitude: optionalNumber(latitude),
        longitude: optionalNumber(longitude),
        google_place_id: googlePlaceId || null,
        formatted_address: formattedAddress || null,
        owner_name: contactName,
        owner_email: ownerEmail,
        owner_phone: ownerPhone || phoneRaw,
        notes: notes || null,
        status: "pending",
        verification_status: verificationStatus,
        ownership_evidence_type: null,
        ownership_evidence_detail: null,
        ownership_attested: ownershipAttested,
        submission_ip_hash: ipHash,
        claimant_was_established_owner: establishedOwner,
        user_id: user.id,
        location_id: match.row?.id || null,
        claim_code: null,
        plan_interest: planInterest,
        plan_interval: planInterval,
        role_at_business: roleAtBusiness,
        match_status: match.matchStatus,
        confidence_score: match.confidenceScore,
        matched_location_snapshot: matchedLocationSnapshot,
        submission_payload: {
          locationName: locationNameRaw,
          address: normalizedAddress || null,
          city: cityRaw,
          state: stateRaw,
          zipCode,
          phone: phoneRaw,
          locationType,
          businessEmail: ownerEmail,
          contactName,
          roleAtBusiness,
          ownershipAttested,
          website: websiteRaw || null,
          planInterest,
          planInterval,
          selectedLocationId: selectedLocationId || null,
          notes: notes || null,
          neighborhood: neighborhood || null,
          latitude: latitude || null,
          longitude: longitude || null,
          googlePlaceId: googlePlaceId || null,
          formattedAddress: formattedAddress || null,
        },
        submitted_at: now,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();

    if (error?.code === "23505") {
      return Response.json(
        { ok: false, error: "active_claim_limit" },
        { status: 409 },
      );
    }
    if (error) throw error;

    await maybeSendEmails({
      ownerEmail,
      contactName,
      locationName: locationNameRaw,
      matched: matchedExistingLocation,
      requestType: "No-code business claim",
      phone: phoneRaw,
      matchStatus: match.matchStatus,
      verificationStatus,
      planInterest,
      claimRequestId: claim.id,
    });

    return Response.json({
      ok: true,
      claimRequestId: claim.id,
      matchedExistingLocation,
      message:
        "Your claim has been submitted for review. Once approved, you’ll be able to access your location dashboard and add details such as photos, descriptions, hours, contact information, and plan options.",
    });
  } catch (error) {
    console.error("No-code claim submission failed", error);
    return Response.json(
      { ok: false, error: "submit_failed" },
      { status: 500 },
    );
  }
}
